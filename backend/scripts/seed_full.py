"""Siembra COMPLETA y determinista para demo de NexoCred.

Construye un portafolio rico de 6 meses a traves de la capa de servicios
(todas las invariantes de dominio se respetan: Decimal, snapshots inmutables,
cronogramas materializados, conservacion de caja).

Cubre:
- 50 personas con BCRA reciente (solo las que pasan filtro se usan para prestamos)
- 3 perfiles de pricing con distintas tasas (28% / 32% / 38%)
- ~35 prestamos con ciclos de vida completos:
    * Lote A: cancelados en su totalidad via m03_prestamos.cancelar()
    * Lote B: vigentes con pagos puntuales cuota a cuota
    * Lote C: morosos sin ningun pago (primera cuota >30 dias vencida)
    * Lote D: novados (refinanciacion + consolidacion, mismo deudor)
    * Lote E: mix — pagos a cuenta (excedente), pagos parciales, cancelacion anticipada
- Pagos multi-cuota con waterfall real (capital/interes/punitorio/excedente)
- Pagos sobredimensionados que generan excedente
- 2 novaciones: refinanciacion y consolidacion
- 5 rutas (cobrador A x3 fechas + cobrador B x2 fechas) con visitas variadas
- 3 periodos de liquidacion de comisiones (aprobadas y pagadas)
- Snapshots de cartera semanales para 6 meses
- CRM: tareas e incidentes para personas morosas
- Documentos: cronograma + recibo por los primeros 10 prestamos
- Alertas de mora por rango completo

Idempotente y crash-safe: el marcador MARCADOR_COMPLETO se escribe ULTIMO.
Fechas deterministas: todo se ancla en FECHA_ANCLA (nunca today()).

Uso:
    cd backend && conda run -n nexocred python -m scripts.seed_full
    cd backend && conda run -n nexocred python -m scripts.seed_full --reset
"""

import asyncio
import sys
import uuid
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.bcra.fake import FakeBcraClient
from app.bcra.puerto import DeudaBcraNormalizada
from app.bcra.servicio import sincronizar_bcra
from app.idempotencia import IdempotencyKey
from app.jobs.snapshot import generar_snapshot
from app.m01_personas.cuil import calcular_digito_verificador
from app.m01_personas.modelos import Persona, PersonaDeudaBcra
from app.m01_personas.schemas import PersonaCreate, ReferenciaIn
from app.m01_personas.servicio import crear_persona
from app.m02_originacion import servicio as orig
from app.m02_originacion.servicio_desembolso import desembolsar
from app.m03_prestamos import servicio as prest
from app.m04_caja.modelos import Caja
from app.m04_caja.servicio import crear_caja
from app.m04_pagos.servicio import registrar_pago
from app.m05_ruta.servicio import (
    cambiar_estado_rendicion,
    generar_rendicion,
    generar_ruta,
    obtener_parada,
    obtener_rendicion,
    obtener_ruta,
    paradas_de_ruta,
    visitar,
)
from app.m06_novaciones import servicio as nov
from app.m07_riesgo.alarmas import procesar as procesar_alarmas
from app.m08_crm.servicio import crear_incidente, crear_tarea
from app.m09_comisiones.modelos import ComisionLiquidacion
from app.m09_comisiones.servicio import (
    aprobar_liquidacion,
    devengar_por_desembolso,
    generar_liquidacion,
    pagar_liquidacion,
)
from app.m10_tesoreria.schemas import AporteRetiroIn
from app.m10_tesoreria.servicio import registrar_aporte
from app.m12_auth.modelos import Rol, Usuario
from app.m12_auth.servicio import crear_usuario
from app.m13_documentos import servicio as docs
from app.m15_catalogo import servicio as cat
from app.m15_catalogo.modelos import PerfilPricing, ProductoCredito
from app.m15_catalogo.schemas import (
    CeldaComisionIn,
    CeldaTasaIn,
    ProductoCreate,
)
from app.modelos_stub import Prestamo, RutaDiaria, SolicitudCredito

# ---------------------------------------------------------------------------
# Anclas deterministas
# ---------------------------------------------------------------------------
FECHA_ANCLA = date(2026, 6, 1)
FECHA_INICIO = date(2026, 1, 1)
SEMILLA = 99
ADMIN_EMAIL = "admin.full@nexocred.test"
N_PERSONAS = 50
PLAZOS = (3, 6, 12)
ROLES = ("admin_sistema", "analista_riesgo", "administrativo", "vendedor", "ceo")

MARCADOR_COMPLETO = "seed_full_completo"
_OP_MARCADOR = "seed_full"

# ---------------------------------------------------------------------------
# Lotes de prestamo
#
# Cada entrada: (p_idx, monto, cuotas, delta_des_dias, offset_pc_dias, lote_tag)
# delta_des_dias: dias desde FECHA_INICIO hasta el desembolso
# offset_pc_dias: dias desde el desembolso hasta la primera cuota
#   positivo -> futura; negativo -> ya vencida (moroso)
# lote_tag: "pagado" | "vigente" | "moroso" | "novar_refi" | "novar_consol_a"
#           | "novar_consol_b" | "excedente" | "cancelar" | "mix"
# ---------------------------------------------------------------------------
_LOTES: list[tuple[int, Decimal, int, int, int, str]] = [
    # ---- Lote A: cancelados (pago total via m03.cancelar) ----
    (0,  Decimal("80000.00"),   3,   0,  30, "cancelar"),
    (1,  Decimal("120000.00"),  6,   5,  30, "cancelar"),
    (2,  Decimal("60000.00"),   3,  10,  30, "cancelar"),
    # ---- Lote B: pagados cuota a cuota (estado final = pagado) ----
    (3,  Decimal("200000.00"),  3,  15,  30, "pagado"),
    (4,  Decimal("150000.00"),  3,  20,  30, "pagado"),
    (5,  Decimal("90000.00"),   3,  25,  30, "pagado"),
    # ---- Lote C: vigentes con pagos puntuales ----
    (6,  Decimal("180000.00"), 12,  90,  30, "vigente"),
    (7,  Decimal("75000.00"),   6,  95,  30, "vigente"),
    (8,  Decimal("110000.00"),  6, 100,  30, "vigente"),
    (9,  Decimal("250000.00"), 12, 105,  30, "vigente"),
    (10, Decimal("130000.00"),  6, 110,  30, "vigente"),
    (11, Decimal("95000.00"),   6, 115,  30, "vigente"),
    (12, Decimal("70000.00"),   3, 120,  30, "vigente"),
    (13, Decimal("160000.00"), 12, 125,  30, "vigente"),
    (14, Decimal("100000.00"),  6, 130,  30, "vigente"),
    # ---- Lote D: morosos (primera cuota ya vencida) ----
    (15, Decimal("85000.00"),   6,  30, -45, "moroso"),
    (16, Decimal("140000.00"),  6,  35, -45, "moroso"),
    (17, Decimal("200000.00"), 12,  40, -45, "moroso"),
    (18, Decimal("50000.00"),   3,  45, -45, "moroso"),
    (19, Decimal("175000.00"),  6,  50, -45, "moroso"),
    # ---- Lote E: novaciones (refinanciacion) — slot 20 ----
    (20, Decimal("100000.00"),  6,  30,  30, "novar_refi"),
    # ---- Lote F: novacion consolidacion — slots 21 + 22, MISMA persona p_idx=21 ----
    (21, Decimal("90000.00"),   6,  35,  30, "novar_consol_a"),
    (21, Decimal("80000.00"),   6,  38,  30, "novar_consol_b"),
    # ---- Lote G: pagos con excedente (monto > deuda) ----
    (22, Decimal("55000.00"),   3,  60,  30, "excedente"),
    (23, Decimal("75000.00"),   3,  65,  30, "excedente"),
    # ---- Lote H: cancelacion anticipada (pago total antes de vencer todas) ----
    (24, Decimal("220000.00"), 12,  62,  30, "cancelar_anticipado"),
    (25, Decimal("170000.00"),  6,  68,  30, "cancelar_anticipado"),
    # ---- Lote I: mix (pagos parciales / tasa alta) ----
    (26, Decimal("90000.00"),   6,  72,  30, "mix"),
    (27, Decimal("130000.00"), 12,  78,  30, "mix"),
    (28, Decimal("75000.00"),   6,  83,  30, "mix"),
    (29, Decimal("110000.00"),  6,  86,  30, "mix"),
]

# Perfiles de pricing con tasas diferenciadas
_PERFILES_TASAS = [
    ("Estandar Full",    Decimal("0.28")),
    ("Premium Full",     Decimal("0.32")),
    ("Riesgo Alto Full", Decimal("0.38")),
]

# Asignacion de perfil por slot (ciclico para distribuir)
def _perfil_para_slot(slot: int) -> str:
    return _PERFILES_TASAS[slot % len(_PERFILES_TASAS)][0]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

class _SeedBcraClient:
    """Re-estampa fecha_informe a hoy para que las personas aprueben bajo la
    vigencia BCRA por defecto sin tocar PARAMETROS_GLOBALES."""

    def __init__(self) -> None:
        self._fake = FakeBcraClient()

    async def consultar(self, cuil: str) -> list[DeudaBcraNormalizada]:
        hoy = date.today()
        return [
            DeudaBcraNormalizada(
                entidad=d.entidad, monto=d.monto, situacion=d.situacion,
                fecha_informe=hoy,
            )
            for d in await self._fake.consultar(cuil)
        ]


def _cuil(i: int) -> str:
    """CUIL valido y determinista. Base 41M evita que el digito verificador sea 0
    (CUIL terminado en 0 = BCRA vacio en el fake client → no aprobable)."""
    dni = 41_000_000 + i
    base = "20" + str(dni)
    dv = calcular_digito_verificador(base)
    return base + str(dv)


def _persona_payload(i: int) -> PersonaCreate:
    cuil = _cuil(i)
    return PersonaCreate(
        apellido=f"Full{i:03d}",
        nombre=f"Cliente{i:03d}",
        dni=str(41_000_000 + i),
        cuil=cuil,
        fecha_nac=date(1975 + (i % 25), (i % 12) + 1, (i % 27) + 1),
        estado_civil="casado" if i % 3 == 0 else "soltero",
        email=f"cliente{i:03d}@full.test",
        telefono=f"11{i:08d}"[:11],
        domicilio_calle="Calle Full",
        domicilio_numero=str(200 + i),
        domicilio_localidad="CABA",
        domicilio_provincia="Buenos Aires",
        tipo_vivienda="propia" if i % 2 == 0 else "alquilada",
        ingresos_declarados=Decimal(str(350_000 + i * 5_000)),
        ingresos_en_blanco=Decimal(str(280_000 + i * 4_000)),
        ingresos_totales=Decimal(str(350_000 + i * 5_000)),
        referencias=[
            ReferenciaIn(
                nombre="Ref", apellido=f"Full{i:03d}",
                telefono="1144556677",
                vinculo="conyuge" if i % 3 == 0 else "madre",
            )
        ],
    )


async def _ya_sembrado(session: AsyncSession) -> bool:
    return await session.scalar(
        select(IdempotencyKey).where(
            IdempotencyKey.clave == MARCADOR_COMPLETO,
            IdempotencyKey.operacion == _OP_MARCADOR,
        )
    ) is not None


async def _marcar_completo(session: AsyncSession) -> None:
    ya = await session.scalar(
        select(IdempotencyKey).where(
            IdempotencyKey.clave == MARCADOR_COMPLETO,
            IdempotencyKey.operacion == _OP_MARCADOR,
        )
    )
    if ya is None:
        session.add(IdempotencyKey(
            clave=MARCADOR_COMPLETO, operacion=_OP_MARCADOR, respuesta_json=None,
        ))
        await session.flush()



async def _seed_localidades(session: AsyncSession) -> None:
    """Siembra localidades principales por provincia (idempotente)."""
    from sqlalchemy import select as _sel
    from app.m16_maestros.modelos import Provincia, Localidad
    from app.m16_maestros.datos_geo import LOCALIDADES_POR_PROVINCIA

    for codigo, localidades in LOCALIDADES_POR_PROVINCIA.items():
        prov = await session.scalar(_sel(Provincia).where(Provincia.codigo == codigo))
        if prov is None:
            continue
        for nombre in localidades:
            existe = await session.scalar(
                _sel(Localidad).where(
                    Localidad.provincia_id == prov.id,
                    Localidad.nombre == nombre,
                )
            )
            if existe is None:
                session.add(Localidad(provincia_id=prov.id, nombre=nombre))
    await session.flush()


async def _asegurar_roles(session: AsyncSession) -> None:
    for nombre in ROLES:
        if await session.scalar(select(Rol).where(Rol.nombre == nombre)) is None:
            session.add(Rol(nombre=nombre))
    await session.flush()


async def _get_or_create_usuario(
    session: AsyncSession, *,
    email: str, nombre: str, roles: list[str], actor_id: uuid.UUID | None,
) -> Usuario:
    existente = await session.scalar(select(Usuario).where(Usuario.email == email))
    if existente is not None:
        return existente
    return await crear_usuario(
        session, email=email, nombre=nombre, password="demo12345",
        roles=roles, actor_id=actor_id,
    )


def _ikey(*partes: str | int) -> str:
    return f"full-{'-'.join(str(p) for p in partes)}-{SEMILLA}"


async def _try(session: AsyncSession, coro) -> bool:  # type: ignore[type-arg]
    """Ejecuta una coroutine; si falla hace rollback y retorna False.
    Unico patron seguro con asyncpg: un error deja la txn abortada hasta rollback."""
    try:
        await coro
        return True
    except Exception:  # noqa: BLE001
        await session.rollback()
        return False


def _fecha_primera_cuota(fecha_des: date, offset_dias: int) -> date:
    """Normaliza la primera cuota al dia 1 del mes para evitar dias invalidos."""
    raw = fecha_des + timedelta(days=abs(offset_dias)) * (1 if offset_dias >= 0 else -1)
    return raw.replace(day=1)


# ---------------------------------------------------------------------------
# Helpers internos
# ---------------------------------------------------------------------------

async def _estado_prestamo(session: AsyncSession, prestamo_id) -> str | None:
    """Consulta el estado actual de un prestamo directo desde la DB."""
    from sqlalchemy import text as _text
    row = await session.execute(
        _text("SELECT estado FROM prestamo WHERE id = :id"), {"id": str(prestamo_id)}
    )
    result = row.fetchone()
    return result[0] if result else None


# ---------------------------------------------------------------------------
# Funcion principal
# ---------------------------------------------------------------------------

async def sembrar_full(session: AsyncSession) -> dict:
    """Portafolio completo. Idempotente y crash-safe."""
    if await _ya_sembrado(session):
        print("seed_full: ya sembrado.")  # noqa: T201
        return await _conteos(session)

    await _asegurar_roles(session)
    await _seed_localidades(session)

    # ---- Usuarios (modelo de 5 roles) ----
    # admin_sistema actúa como actor de auditoría de la siembra.
    admin = await _get_or_create_usuario(
        session, email="sistema.full@nexocred.test", nombre="Admin Sistema Full",
        roles=["admin_sistema"], actor_id=None,
    )
    actor = admin.id

    vendedor = await _get_or_create_usuario(
        session, email="vendedor.full@nexocred.test", nombre="Vendedor Full",
        roles=["vendedor"], actor_id=actor,
    )
    # cobrador_a/b y operador del modelo viejo se consolidan en "administrativo"
    # (opera rutas, cobranza, pagos y CRM). Se mantienen como usuarios distintos
    # para que la siembra de rutas/cobranza siga teniendo varios responsables.
    cobrador_a = await _get_or_create_usuario(
        session, email="administrativo_a.full@nexocred.test", nombre="Administrativo A Full",
        roles=["administrativo"], actor_id=actor,
    )
    cobrador_b = await _get_or_create_usuario(
        session, email="administrativo_b.full@nexocred.test", nombre="Administrativo B Full",
        roles=["administrativo"], actor_id=actor,
    )
    operador = await _get_or_create_usuario(
        session, email="administrativo.full@nexocred.test", nombre="Administrativo Full",
        roles=["administrativo"], actor_id=actor,
    )
    await _get_or_create_usuario(
        session, email="riesgo.full@nexocred.test", nombre="Analista de Riesgo Full",
        roles=["analista_riesgo"], actor_id=actor,
    )
    await _get_or_create_usuario(
        session, email="ceo.full@nexocred.test", nombre="CEO Full",
        roles=["ceo"], actor_id=actor,
    )

    # ---- Producto ----
    producto = await session.scalar(
        select(ProductoCredito).where(ProductoCredito.nombre == "Prestamo Personal Full")
    )
    if producto is None:
        producto = await cat.crear_producto(
            session,
            ProductoCreate(
                nombre="Prestamo Personal Full", periodicidad="mensual",
                plazos_permitidos=list(PLAZOS),
                monto_minimo=Decimal("10000.00"), monto_maximo=Decimal("5000000.00"),
            ),
            actor_id=actor,
        )
        await cat.publicar_producto(session, producto, actor_id=actor)

    # ---- 3 perfiles con tasas distintas + comision por perfil ----
    perfiles: dict[str, PerfilPricing] = {}
    for orden, (nombre_perf, tasa_perf) in enumerate(_PERFILES_TASAS, start=1):
        perf = await session.scalar(
            select(PerfilPricing).where(PerfilPricing.nombre == nombre_perf)
        )
        if perf is None:
            perf = await cat.crear_perfil(
                session, nombre=nombre_perf, descripcion=None, orden=orden, actor_id=actor,
            )
        perfiles[nombre_perf] = perf
        await cat.upsert_matriz_tasas(
            session,
            [CeldaTasaIn(
                producto_id=producto.id, perfil_id=perf.id, plazo=p, tasa=tasa_perf,
            ) for p in PLAZOS],
            actor_id=actor,
        )
        comision = Decimal("0.03") if "Riesgo" in nombre_perf else Decimal("0.025")
        await cat.upsert_matriz_comisiones(
            session,
            [CeldaComisionIn(
                producto_id=producto.id, perfil_id=perf.id, comision=comision,
            )],
            actor_id=actor,
        )

    # ---- Caja + capital inicial ----
    caja = await session.scalar(select(Caja).where(Caja.nombre == "Caja Full Demo"))
    if caja is None:
        caja = await crear_caja(
            session, nombre="Caja Full Demo", tipo="efectivo", actor_id=actor,
        )
    await session.commit()

    # Extraer IDs como valores Python para que no dependan de ORM lazy-load tras rollback
    caja_id = caja.id
    vendedor_id = vendedor.id
    cobrador_a_id = cobrador_a.id
    cobrador_b_id = cobrador_b.id
    operador_id = operador.id

    await registrar_aporte(
        session,
        AporteRetiroIn(
            monto=Decimal("30000000.00"), fecha_negocio=FECHA_INICIO, caja_id=caja_id,
            inversor="Inversores Fundadores", nota="capital inicial seed full",
        ),
        actor_id=actor, idempotency_key=_ikey("aporte-inicial"),
    )

    # ---- Personas + BCRA ----
    bcra = _SeedBcraClient()
    personas: list[uuid.UUID] = []
    personas_con_bcra: list[uuid.UUID] = []
    for i in range(N_PERSONAS):
        cuil = _cuil(i)
        persona = await session.scalar(select(Persona).where(Persona.cuil == cuil))
        if persona is None:
            persona = await crear_persona(session, _persona_payload(i), actor_id=actor)
        ya_bcra = await session.scalar(
            select(PersonaDeudaBcra.id).where(PersonaDeudaBcra.persona_id == persona.id)
        )
        if ya_bcra is None:
            filas = await sincronizar_bcra(session, persona.id, bcra, actor_id=actor)
            tiene_bcra = bool(filas)
        else:
            tiene_bcra = True
        personas.append(persona.id)
        if tiene_bcra:
            personas_con_bcra.append(persona.id)
    await session.commit()

    n_aprobables = len(personas_con_bcra)

    def _pid(p_idx: int) -> uuid.UUID:
        """Mapea p_idx a persona aprobable de forma ciclica."""
        return personas_con_bcra[p_idx % n_aprobables]

    # ---- Prestamos: desembolso + devengo de comision ----
    # prestamos_por_slot[slot] -> UUID del prestamo (evita lazy-load tras rollback)
    prestamos_por_slot: dict[int, uuid.UUID] = {}

    for slot, (p_idx, monto, cuotas, delta_des, offset_pc, _tag) in enumerate(_LOTES):
        persona_id = _pid(p_idx)
        fecha_des = FECHA_INICIO + timedelta(days=delta_des)
        fecha_pc = _fecha_primera_cuota(fecha_des, offset_pc)

        # Perfil segun slot (distribuye las 3 tasas)
        nombre_perf = _perfil_para_slot(slot)
        perfil = perfiles[nombre_perf]

        # Resumible: busca prestamo ya existente para este slot (idem key)
        ikey_des = _ikey("des", slot)
        existente = await session.scalar(
            select(Prestamo)
            .join(SolicitudCredito, Prestamo.solicitud_id == SolicitudCredito.id)
            .where(
                SolicitudCredito.persona_id == persona_id,
                SolicitudCredito.producto_id == producto.id,
                Prestamo.fecha_desembolso == fecha_des,
            )
        )
        if existente is not None:
            prestamos_por_slot[slot] = existente.id
            continue

        sol = await orig.crear_solicitud(
            session, persona_id=persona_id, producto_id=producto.id,
            monto=monto, cantidad_cuotas=cuotas,
            vendedor_id=vendedor_id, actor_id=actor,
        )
        # Asignar perfil antes de evaluar para que la tasa sea la correcta
        sol.perfil_id = perfil.id  # type: ignore[attr-defined]
        await session.flush()
        await orig.evaluar(session, sol, actor_id=actor)
        await orig.cambiar_estado(session, sol, "aprobada", motivo_rechazo=None, actor_id=actor)
        await session.commit()

        out = await desembolsar(
            session, solicitud=sol, caja_id=caja_id,
            fecha_negocio=fecha_des, fecha_primera_cuota=fecha_pc,
            tasa_punitorio_diario=Decimal("0.001"),
            idempotency_key=ikey_des, actor_id=actor,
        )
        prestamo = await session.scalar(
            select(Prestamo).where(Prestamo.id == out.prestamo_id)
        )
        assert prestamo is not None
        prestamos_por_slot[slot] = prestamo.id
        await devengar_por_desembolso(
            session, prestamo=prestamo, solicitud=sol,
            fecha_negocio=fecha_des, actor_id=actor,
        )
        await session.commit()

    # ---- Ciclos de vida por tag ----

    # TAG: "cancelar" — pago total del saldo via m03.cancelar (fecha: 60-90 dias post-des)
    for slot, (*_, tag) in enumerate(_LOTES):
        if tag != "cancelar":
            continue
        prestamo_id = prestamos_por_slot.get(slot)
        if prestamo_id is None:
            continue
        est = await _estado_prestamo(session, prestamo_id)
        if est not in ("vigente", "en_mora"):
            continue
        _, _, _, delta_des, _, _ = _LOTES[slot]
        fecha_cancel = FECHA_INICIO + timedelta(days=delta_des + 60)
        ok = await _try(session, prest.cancelar(
            session, prestamo_id=prestamo_id, caja_id=caja_id,
            fecha_negocio=fecha_cancel, canal="mostrador",
            idempotency_key=_ikey("cancel", slot), actor_id=actor,
        ))
        if ok:
            await session.commit()

    # TAG: "pagado" — pagar todas las cuotas mes a mes; luego cancelar el saldo restante
    for slot, (_, monto, cuotas, delta_des, offset_pc, tag) in enumerate(_LOTES):
        if tag != "pagado":
            continue
        prestamo_id = prestamos_por_slot.get(slot)
        if prestamo_id is None:
            continue
        if await _estado_prestamo(session, prestamo_id) in ("cancelado", "novado", "pagado"):
            continue
        cuota_aprox = (monto * Decimal("1.35") / cuotas).quantize(Decimal("100.00"))
        # Pagar cuotas - 1 y luego cancelar el saldo restante con payoff
        # (si pagamos todas, saldo = 0 y cancelar falla con monto_invalido)
        for k in range(cuotas - 1):
            fecha_pago = FECHA_INICIO + timedelta(days=delta_des + offset_pc + k * 30 + 5)
            if fecha_pago > FECHA_ANCLA:
                break
            ok = await _try(session, registrar_pago(
                session, prestamo_id=prestamo_id,
                monto=cuota_aprox, canal="mostrador", caja_id=caja_id,
                fecha_negocio=fecha_pago,
                idempotency_key=_ikey("pago", slot, k), actor_id=actor,
            ))
            if ok:
                await session.commit()
        # Cancelar el saldo restante con payoff total
        est_fin = await _estado_prestamo(session, prestamo_id)
        if est_fin in ("vigente", "en_mora"):
            fecha_fin = FECHA_INICIO + timedelta(days=delta_des + offset_pc + cuotas * 30 + 15)
            if fecha_fin <= FECHA_ANCLA:
                ok = await _try(session, prest.cancelar(
                    session, prestamo_id=prestamo_id, caja_id=caja_id,
                    fecha_negocio=fecha_fin, canal="mostrador",
                    idempotency_key=_ikey("cancel-fin", slot), actor_id=actor,
                ))
                if ok:
                    await session.commit()

    # TAG: "vigente" — pagar cuotas vencidas hasta FECHA_ANCLA
    for slot, (_, monto, cuotas, delta_des, offset_pc, tag) in enumerate(_LOTES):
        if tag != "vigente":
            continue
        prestamo_id = prestamos_por_slot.get(slot)
        if prestamo_id is None:
            continue
        if await _estado_prestamo(session, prestamo_id) in ("cancelado", "novado", "pagado"):
            continue
        cuota_aprox = (monto * Decimal("1.30") / cuotas).quantize(Decimal("100.00"))
        _fin_pc = FECHA_INICIO + timedelta(days=delta_des + offset_pc)
        n_vencidas = max(0, (FECHA_ANCLA - _fin_pc).days // 30)
        for k in range(min(n_vencidas, cuotas - 1)):
            fecha_pago = FECHA_INICIO + timedelta(days=delta_des + offset_pc + k * 30 + 5)
            if fecha_pago > FECHA_ANCLA:
                break
            ok = await _try(session, registrar_pago(
                session, prestamo_id=prestamo_id,
                monto=cuota_aprox, canal="mostrador", caja_id=caja_id,
                fecha_negocio=fecha_pago,
                idempotency_key=_ikey("pago", slot, k), actor_id=actor,
            ))
            if ok:
                await session.commit()

    # TAG: "moroso" — sin pagos; las alarmas los marcan en mora

    # TAG: "novar_refi" — un pago previo + refinanciar
    for slot, (*_, tag) in enumerate(_LOTES):
        if tag != "novar_refi":
            continue
        prestamo_id = prestamos_por_slot.get(slot)
        if prestamo_id is None:
            continue
        if await _estado_prestamo(session, prestamo_id) != "vigente":
            continue
        _, monto, cuotas, delta_des, offset_pc, _ = _LOTES[slot]
        cuota_aprox = (monto * Decimal("1.30") / cuotas).quantize(Decimal("100.00"))
        fecha_pago1 = FECHA_INICIO + timedelta(days=delta_des + offset_pc + 5)
        ok = await _try(session, registrar_pago(
            session, prestamo_id=prestamo_id,
            monto=cuota_aprox, canal="mostrador", caja_id=caja_id,
            fecha_negocio=fecha_pago1,
            idempotency_key=_ikey("pago", slot, 0), actor_id=actor,
        ))
        if ok:
            await session.commit()
        fecha_nov = FECHA_INICIO + timedelta(days=delta_des + 75)
        if fecha_nov > FECHA_ANCLA:
            continue
        ok = await _try(session, nov.refinanciar(
            session, prestamo_id=prestamo_id, caja_id=caja_id,
            fecha_negocio=fecha_nov, tasa=Decimal("0.25"),
            cantidad_cuotas=12, periodicidad="mensual",
            fecha_primera_cuota=(fecha_nov + timedelta(days=30)).replace(day=1),
            idempotency_key=_ikey("nov-refi", slot),
            actor_id=actor,
        ))
        if ok:
            await session.commit()

    # TAG: "novar_consol_a" + "novar_consol_b" — consolidar dos prestamos del mismo deudor
    slots_consol_a = [s for s, (*_, t) in enumerate(_LOTES) if t == "novar_consol_a"]
    slots_consol_b = [s for s, (*_, t) in enumerate(_LOTES) if t == "novar_consol_b"]
    for sa, sb in zip(slots_consol_a, slots_consol_b, strict=False):
        pa_id = prestamos_por_slot.get(sa)
        pb_id = prestamos_por_slot.get(sb)
        if pa_id is None or pb_id is None:
            continue
        # Leer estado y persona fresco desde la DB
        pa = await session.scalar(select(Prestamo).where(Prestamo.id == pa_id))
        pb = await session.scalar(select(Prestamo).where(Prestamo.id == pb_id))
        if pa is None or pb is None:
            continue
        if pa.estado != "vigente" or pb.estado != "vigente":
            continue
        if pa.persona_id != pb.persona_id:
            continue
        _, _, _, delta_a, _, _ = _LOTES[sa]
        fecha_nov = FECHA_INICIO + timedelta(days=delta_a + 80)
        if fecha_nov > FECHA_ANCLA:
            continue
        ok = await _try(session, nov.consolidar(
            session, prestamo_ids=[pa_id, pb_id], caja_id=caja_id,
            fecha_negocio=fecha_nov, tasa=Decimal("0.27"),
            cantidad_cuotas=12, periodicidad="mensual",
            fecha_primera_cuota=(fecha_nov + timedelta(days=30)).replace(day=1),
            idempotency_key=_ikey("nov-consol", sa, sb),
            actor_id=actor,
        ))
        if ok:
            await session.commit()

    # TAG: "excedente" — pago sobredimensionado (mas que la cuota) para generar excedente
    for slot, (_, monto, cuotas, delta_des, offset_pc, tag) in enumerate(_LOTES):
        if tag != "excedente":
            continue
        prestamo_id = prestamos_por_slot.get(slot)
        if prestamo_id is None:
            continue
        if await _estado_prestamo(session, prestamo_id) in ("cancelado", "novado", "pagado"):
            continue
        cuota_real = (monto * Decimal("1.30") / cuotas).quantize(Decimal("100.00"))
        monto_sobre = cuota_real * Decimal("2.5")
        fecha_pago = FECHA_INICIO + timedelta(days=delta_des + offset_pc + 5)
        if fecha_pago <= FECHA_ANCLA:
            ok = await _try(session, registrar_pago(
                session, prestamo_id=prestamo_id,
                monto=monto_sobre, canal="mostrador", caja_id=caja_id,
                fecha_negocio=fecha_pago,
                idempotency_key=_ikey("pago", slot, 0), actor_id=actor,
            ))
            if ok:
                await session.commit()
        fecha_pago2 = fecha_pago + timedelta(days=35)
        if fecha_pago2 <= FECHA_ANCLA:
            ok = await _try(session, registrar_pago(
                session, prestamo_id=prestamo_id,
                monto=cuota_real, canal="mostrador", caja_id=caja_id,
                fecha_negocio=fecha_pago2,
                idempotency_key=_ikey("pago", slot, 1), actor_id=actor,
            ))
            if ok:
                await session.commit()

    # TAG: "cancelar_anticipado" — 1 pago normal + cancelacion anticipada
    for slot, (_, _, cuotas, delta_des, offset_pc, tag) in enumerate(_LOTES):
        if tag != "cancelar_anticipado":
            continue
        prestamo_id = prestamos_por_slot.get(slot)
        if prestamo_id is None:
            continue
        if await _estado_prestamo(session, prestamo_id) not in ("vigente", "en_mora"):
            continue
        _, monto, cuotas, delta_des, offset_pc, _ = _LOTES[slot]
        cuota_aprox = (monto * Decimal("1.30") / cuotas).quantize(Decimal("100.00"))
        fecha_pago1 = FECHA_INICIO + timedelta(days=delta_des + offset_pc + 5)
        if fecha_pago1 <= FECHA_ANCLA:
            ok = await _try(session, registrar_pago(
                session, prestamo_id=prestamo_id,
                monto=cuota_aprox, canal="mostrador", caja_id=caja_id,
                fecha_negocio=fecha_pago1,
                idempotency_key=_ikey("pago", slot, 0), actor_id=actor,
            ))
            if ok:
                await session.commit()
        fecha_cancel = FECHA_INICIO + timedelta(days=delta_des + offset_pc + cuotas * 30 // 2)
        if fecha_cancel <= FECHA_ANCLA:
            ok = await _try(session, prest.cancelar(
                session, prestamo_id=prestamo_id, caja_id=caja_id,
                fecha_negocio=fecha_cancel, canal="mostrador",
                idempotency_key=_ikey("cancel", slot), actor_id=actor,
            ))
            if ok:
                await session.commit()

    # TAG: "mix" — pagos alternando cuota completa / parcial
    for slot, (_, monto, cuotas, delta_des, offset_pc, tag) in enumerate(_LOTES):
        if tag != "mix":
            continue
        prestamo_id = prestamos_por_slot.get(slot)
        if prestamo_id is None:
            continue
        if await _estado_prestamo(session, prestamo_id) in ("cancelado", "novado", "pagado"):
            continue
        cuota_aprox = (monto * Decimal("1.30") / cuotas).quantize(Decimal("100.00"))
        monto_parcial = (cuota_aprox * Decimal("0.60")).quantize(Decimal("100.00"))
        _fin_pc = FECHA_INICIO + timedelta(days=delta_des + offset_pc)
        n_vencidas = max(0, (FECHA_ANCLA - _fin_pc).days // 30)
        for k in range(min(n_vencidas, cuotas - 1)):
            fecha_pago = FECHA_INICIO + timedelta(days=delta_des + offset_pc + k * 30 + 5)
            if fecha_pago > FECHA_ANCLA:
                break
            monto_k = cuota_aprox if k % 2 == 0 else monto_parcial
            ok = await _try(session, registrar_pago(
                session, prestamo_id=prestamo_id,
                monto=monto_k, canal="mostrador", caja_id=caja_id,
                fecha_negocio=fecha_pago,
                idempotency_key=_ikey("pago", slot, k), actor_id=actor,
            ))
            if ok:
                await session.commit()

    # ---- Rutas: cobrador A x3 fechas + cobrador B x2 fechas ----
    rutas_cfg = [
        (cobrador_a_id, FECHA_INICIO + timedelta(days=30)),
        (cobrador_a_id, FECHA_INICIO + timedelta(days=60)),
        (cobrador_a_id, FECHA_ANCLA),
        (cobrador_b_id, FECHA_INICIO + timedelta(days=45)),
        (cobrador_b_id, FECHA_INICIO + timedelta(days=90)),
    ]
    resultados_ciclo = ["pago", "parcial", "ausente", "promesa", "pago", "se_niega", "pago"]

    for cobrador_id_ruta, fecha_ruta in rutas_cfg:
        ruta = await session.scalar(
            select(RutaDiaria).where(
                RutaDiaria.cobrador_id == cobrador_id_ruta,
                RutaDiaria.fecha == fecha_ruta,
            )
        )
        if ruta is None:
            ruta = await generar_ruta(
                session, cobrador_id=cobrador_id_ruta, fecha=fecha_ruta, actor_id=actor,
            )

        ruta_id_local = ruta.id
        paradas = await paradas_de_ruta(session, ruta_id_local)
        ruta_obj = await obtener_ruta(session, ruta_id_local)
        assert ruta_obj is not None

        cobros = 0
        for k, p in enumerate(paradas[:6]):
            parada = await obtener_parada(session, p.id)
            if parada is None or parada.visitada_en is not None:
                continue
            res_visita = resultados_ciclo[k % len(resultados_ciclo)]
            monto_v = Decimal("20000.00") if res_visita in ("pago", "parcial") else None
            ok = await _try(session, visitar(
                session, ruta=ruta_obj, parada=parada,
                resultado=res_visita, monto_cobrado=monto_v,
                foto_url=None, lat=None, lng=None,
                notas=f"seed full {res_visita}", caja_id=caja_id,
                fecha_negocio=fecha_ruta, actor_id=cobrador_id_ruta,
            ))
            if ok:
                await session.commit()
                if monto_v is not None:
                    cobros += 1
            # Re-fetch ruta_obj after potential rollback
            ruta_obj = await obtener_ruta(session, ruta_id_local)
            if ruta_obj is None:
                break

        if cobros:
            ok = await _try(session, generar_rendicion(
                session, ruta_id=ruta_id_local, fecha_negocio=fecha_ruta,
                actor_id=cobrador_id_ruta,
            ))
            if ok:
                await session.commit()
                rendicion_obj = await obtener_rendicion(session, ruta_id_local)
                if rendicion_obj is not None and rendicion_obj.estado == "pendiente":
                    ok2 = await _try(session, cambiar_estado_rendicion(
                        session, rendicion=rendicion_obj, estado="aprobada",
                        actor_id=actor,
                    ))
                    if ok2:
                        await session.commit()

        await session.commit()

    # ---- Liquidaciones de comisiones: 3 periodos ----
    periodos_liq = [
        (FECHA_INICIO,                          FECHA_INICIO + timedelta(days=59)),
        (FECHA_INICIO + timedelta(days=60),     FECHA_INICIO + timedelta(days=119)),
        (FECHA_INICIO + timedelta(days=120),    FECHA_ANCLA),
    ]
    for k, (desde, hasta) in enumerate(periodos_liq):
        liq = await session.scalar(
            select(ComisionLiquidacion).where(
                ComisionLiquidacion.vendedor_id == vendedor_id,
                ComisionLiquidacion.periodo_desde == desde,
            )
        )
        if liq is None:
            try:
                liq = await generar_liquidacion(
                    session, vendedor_id=vendedor_id,
                    periodo_desde=desde, periodo_hasta=hasta,
                    actor_id=actor,
                )
            except Exception:  # noqa: BLE001
                await session.rollback()
                continue

        if liq.estado == "borrador" and liq.monto_total and liq.monto_total > Decimal("0"):
            ok = await _try(session, aprobar_liquidacion(session, liquidacion=liq, actor_id=actor))
            if ok:
                await session.commit()
                liq = await session.scalar(
                    select(ComisionLiquidacion).where(ComisionLiquidacion.id == liq.id)
                )
            if liq is not None and liq.estado == "aprobada":
                ok2 = await _try(session, pagar_liquidacion(
                    session, liquidacion_id=liq.id, caja_id=caja_id,
                    fecha_negocio=hasta,
                    idempotency_key=_ikey("liq", k), actor_id=actor,
                ))
                if ok2:
                    await session.commit()
        await session.commit()

    # ---- Snapshots semanales ----
    fecha_snap = FECHA_INICIO
    while fecha_snap <= FECHA_ANCLA:
        try:  # noqa: SIM105
            await generar_snapshot(session, fecha_snap, actor_id=actor)
            await session.commit()
        except Exception:  # noqa: BLE001
            await session.rollback()
        fecha_snap += timedelta(weeks=1)

    # ---- Alertas de mora (mensual + cierre) ----
    for mes in range(6):
        fecha_alarma = FECHA_INICIO + timedelta(days=mes * 30)
        try:  # noqa: SIM105
            await procesar_alarmas(session, fecha=fecha_alarma, actor_id=actor)
            await session.commit()
        except Exception:  # noqa: BLE001
            await session.rollback()
    try:  # noqa: SIM105
        await procesar_alarmas(session, fecha=FECHA_ANCLA, actor_id=actor)
        await session.commit()
    except Exception:  # noqa: BLE001
        await session.rollback()

    # ---- CRM: tareas e incidentes para morosos (slots tag=="moroso") ----
    slots_morosos = [s for s, (*_, t) in enumerate(_LOTES) if t == "moroso"]
    for slot in slots_morosos:
        p_idx = _LOTES[slot][0]
        persona_id = _pid(p_idx)
        ok = await _try(session, crear_tarea(
            session, persona_id=persona_id, operador_id=operador_id,
            titulo=f"Gestionar mora — slot {slot}",
            descripcion="Contactar deudor para plan de regularizacion.",
            prioridad="alta",
            vencimiento=FECHA_ANCLA + timedelta(days=7),
            origen="alarma", actor_id=actor, commit=False,
        ))
        if ok:
            await session.commit()
        ok2 = await _try(session, crear_incidente(
            session, persona_id=persona_id,
            tipo="mora",
            titulo=f"Deuda vencida >30 dias — slot {slot}",
            severidad="alta",
            detalle="Primera cuota sin pago. Requiere gestion de cobranza.",
            operador_id=operador_id, actor_id=actor,
        ))
        if ok2:
            await session.commit()
    await session.commit()

    # ---- Documentos: cronograma + recibo para primeros 10 slots ----
    for slot in range(min(10, len(prestamos_por_slot))):
        prestamo_id_doc = prestamos_por_slot.get(slot)
        if prestamo_id_doc is None:
            continue
        for tipo in ("cronograma", "recibo"):
            ok = await _try(session, docs.generar(
                session, tipo=tipo, prestamo_id=prestamo_id_doc,
                actor_id=actor,
                idempotency_key=_ikey("doc", tipo, slot),
            ))
            if ok:
                await session.commit()
    await session.commit()

    # ---- Marcador final (crash-safe) ----
    await _marcar_completo(session)
    await session.commit()

    return await _conteos(session)


async def _conteos(session: AsyncSession) -> dict:
    from sqlalchemy import func, text

    from app.m01_personas.modelos import Persona
    from app.modelos_stub import (
        Alerta,
        DocumentoEmitido,
        Pago,
        SnapshotCartera,
        Tarea,
    )

    async def _c(modelo) -> int:
        return await session.scalar(select(func.count()).select_from(modelo)) or 0

    estados = {}
    res = await session.execute(
        text("SELECT estado, count(*) FROM prestamo GROUP BY estado")
    )
    for estado, cnt in res.all():
        estados[estado] = cnt

    return {
        "personas": await _c(Persona),
        "prestamos": sum(estados.values()),
        "prestamos_por_estado": estados,
        "solicitudes": await _c(SolicitudCredito),
        "pagos": await _c(Pago),
        "alertas": await _c(Alerta),
        "snapshots": await _c(SnapshotCartera),
        "tareas": await _c(Tarea),
        "documentos": await _c(DocumentoEmitido),
    }


async def _reset_marcador(session: AsyncSession) -> None:
    marcador = await session.scalar(
        select(IdempotencyKey).where(
            IdempotencyKey.clave == MARCADOR_COMPLETO,
            IdempotencyKey.operacion == _OP_MARCADOR,
        )
    )
    if marcador is not None:
        await session.delete(marcador)
        await session.commit()
        print("seed_full: marcador eliminado, la proxima corrida re-siembra.")  # noqa: T201


async def _main() -> None:
    from app.db import async_session_maker

    async with async_session_maker() as session:
        if "--reset" in sys.argv:
            await _reset_marcador(session)
        res = await sembrar_full(session)
        await session.commit()

    print("Siembra full completa:", res)  # noqa: T201


if __name__ == "__main__":
    asyncio.run(_main())
