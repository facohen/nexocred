"""Siembra COMPLETA y determinista para demo de NexoCred.

Construye un portafolio rico de 6 meses a traves de la capa de servicios
(todas las invariantes de dominio se respetan: Decimal, snapshots inmutables,
cronogramas materializados, conservacion de caja).

Cubre:
- 50 personas con BCRA reciente
- ~35 prestamos con ciclos de vida completos (vigente, en_mora, pagado,
  cancelado, novado/refinanciado/consolidado)
- Pagos multi-cuota con waterfall real (capital/interes/punitorio/excedente)
- 2 novaciones: refinanciacion y consolidacion
- 3 meses de rutas (cobrador A y cobrador B) con visitas variadas
- 3 periodos de liquidacion de comisiones
- Snapshots de cartera diarios para cada semana del rango
- CRM: tareas e incidentes por persona morosa
- Documentos: cronograma + recibo por prestamo
- Alertas de mora por rango completo

Idempotente y crash-safe: el marcador MARCADOR_COMPLETO se escribe ULTIMO.
Fechas deterministas: todo se ancla en FECHA_ANCLA (nunca today()).

Uso:
    cd backend && conda run -n nexocred python -m scripts.seed_full [--reset]
"""

import asyncio
import contextlib
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
# Anclas
# ---------------------------------------------------------------------------
# El portafolio cubre 6 meses terminando en FECHA_ANCLA.
FECHA_ANCLA = date(2026, 6, 1)
FECHA_INICIO = date(2026, 1, 1)          # primer desembolso del rango
SEMILLA = 99
ADMIN_EMAIL = "admin.full@nexocred.test"
N_PERSONAS = 50
PLAZOS = (3, 6, 12)
ROLES = ("admin", "analista", "cobrador", "vendedor", "operador", "tesoreria")

MARCADOR_COMPLETO = "seed_full_completo"
_OP_MARCADOR = "seed_full"

# Configuracion de la cartera sintetica
# Cada tupla: (indice_persona, monto, cuotas, delta_dias_hasta_desembolso_desde_inicio,
#              primera_cuota_offset_dias, moroso)
# delta_dias_hasta_desembolso_desde_inicio: 0 = primer dia, 30 = mes 2, etc.
_LOTES_PRESTAMO: list[tuple[int, Decimal, int, int, int, bool]] = [
    # --- Lote A: prestamos pagados en su totalidad (meses 1-2) ---
    (0,  Decimal("80000.00"),   3,   0,  30, False),
    (1,  Decimal("120000.00"),  6,   5,  30, False),
    (2,  Decimal("60000.00"),   3,  10,  30, False),
    (3,  Decimal("200000.00"),  6,  15,  30, False),
    (4,  Decimal("150000.00"),  3,  20,  30, False),
    # --- Lote B: vigentes sin mora (desembolsos recientes) ---
    (5,  Decimal("90000.00"),   6,  90,  30, False),
    (6,  Decimal("180000.00"), 12,  95,  30, False),
    (7,  Decimal("75000.00"),   6, 100,  30, False),
    (8,  Decimal("110000.00"),  6, 105,  30, False),
    (9,  Decimal("250000.00"), 12, 110,  30, False),
    (10, Decimal("130000.00"),  6, 115,  30, False),
    (11, Decimal("95000.00"),   6, 120,  30, False),
    (12, Decimal("70000.00"),   3, 125,  30, False),
    (13, Decimal("160000.00"), 12, 130,  30, False),
    (14, Decimal("100000.00"),  6, 135,  30, False),
    # --- Lote C: morosos (primera cuota vencida hace >30 dias) ---
    (15, Decimal("85000.00"),   6,  30, -45, True),
    (16, Decimal("140000.00"),  6,  35, -45, True),
    (17, Decimal("200000.00"), 12,  40, -45, True),
    (18, Decimal("50000.00"),   3,  45, -45, True),
    (19, Decimal("175000.00"),  6,  50, -45, True),
    # --- Lote D: candidatos a novar (vigentes, meses 2-3) ---
    (20, Decimal("100000.00"),  6,  30,  30, False),
    (21, Decimal("90000.00"),   6,  35,  30, False),
    (22, Decimal("80000.00"),   6,  40,  30, False),
    # --- Lote E: mix adicional para volumetria ---
    (23, Decimal("55000.00"),   3,  60,  30, False),
    (24, Decimal("220000.00"), 12,  65,  30, False),
    (25, Decimal("170000.00"),  6,  70,  30, False),
    (26, Decimal("90000.00"),   6,  75,  30, False),
    (27, Decimal("130000.00"), 12,  80,  30, False),
    (28, Decimal("75000.00"),   6,  85,  30, False),
    (29, Decimal("110000.00"),  6,  88,  30, False),
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

class _SeedBcraClient:
    """Delega en el fake pero reestampa fecha_informe a hoy para que las personas
    aprueben bajo la vigencia BCRA por defecto (sin tocar PARAMETROS_GLOBALES)."""

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
    dni = 40_000_000 + i
    base = "20" + str(dni)
    dv = calcular_digito_verificador(base)
    return base + str(dv)


def _persona_payload(i: int) -> PersonaCreate:
    cuil = _cuil(i)
    return PersonaCreate(
        apellido=f"Full{i:03d}",
        nombre=f"Cliente{i:03d}",
        dni=str(40_000_000 + i),
        cuil=cuil,
        fecha_nac=date(1980 + (i % 20), (i % 12) + 1, (i % 27) + 1),
        estado_civil="casado" if i % 3 == 0 else "soltero",
        email=f"cliente{i:03d}@full.test",
        telefono=f"11{i:08d}"[:11],
        domicilio_calle="Calle Full",
        domicilio_numero=str(200 + i),
        domicilio_localidad="CABA",
        domicilio_provincia="Buenos Aires",
        tipo_vivienda="propia" if i % 2 == 0 else "alquilada",
        ingresos_declarados=Decimal(str(300_000 + i * 5_000)),
        ingresos_en_blanco=Decimal(str(250_000 + i * 4_000)),
        ingresos_totales=Decimal(str(300_000 + i * 5_000)),
        referencias=[
            ReferenciaIn(
                nombre="Ref", apellido=f"Full{i:03d}",
                telefono="1144556677", vinculo="conyuge" if i % 3 == 0 else "madre",
            )
        ],
    )


async def _ya_sembrado(session: AsyncSession) -> bool:
    marcador = await session.scalar(
        select(IdempotencyKey).where(
            IdempotencyKey.clave == MARCADOR_COMPLETO,
            IdempotencyKey.operacion == _OP_MARCADOR,
        )
    )
    return marcador is not None


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


async def _asegurar_roles(session: AsyncSession) -> None:
    for nombre in ROLES:
        existe = await session.scalar(select(Rol).where(Rol.nombre == nombre))
        if existe is None:
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


def _ikey(sufijo: str) -> str:
    return f"full-{sufijo}-{SEMILLA}"


# ---------------------------------------------------------------------------
# Funcion principal
# ---------------------------------------------------------------------------

async def sembrar_full(session: AsyncSession) -> dict:
    """Construye el portafolio completo. Idempotente y crash-safe."""
    if await _ya_sembrado(session):
        print("seed_full: ya sembrado, nada que hacer.")  # noqa: T201
        return await _conteos(session)

    await _asegurar_roles(session)

    # ---- Usuarios ----
    admin = await _get_or_create_usuario(
        session, email=ADMIN_EMAIL, nombre="Admin Full",
        roles=["admin"], actor_id=None,
    )
    actor = admin.id

    vendedor = await _get_or_create_usuario(
        session, email="vendedor.full@nexocred.test", nombre="Vendedor Full",
        roles=["vendedor"], actor_id=actor,
    )
    cobrador_a = await _get_or_create_usuario(
        session, email="cobrador_a.full@nexocred.test", nombre="Cobrador A Full",
        roles=["cobrador"], actor_id=actor,
    )
    cobrador_b = await _get_or_create_usuario(
        session, email="cobrador_b.full@nexocred.test", nombre="Cobrador B Full",
        roles=["cobrador"], actor_id=actor,
    )
    operador = await _get_or_create_usuario(
        session, email="operador.full@nexocred.test", nombre="Operador Full",
        roles=["operador"], actor_id=actor,
    )
    for rol in ("analista", "tesoreria"):
        await _get_or_create_usuario(
            session, email=f"{rol}.full@nexocred.test", nombre=f"{rol.title()} Full",
            roles=[rol], actor_id=actor,
        )

    # ---- Producto + perfil + matrices ----
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

    perfil = await session.scalar(
        select(PerfilPricing).where(PerfilPricing.nombre == "Estandar Full")
    )
    if perfil is None:
        perfil = await cat.crear_perfil(
            session, nombre="Estandar Full", descripcion=None, orden=1, actor_id=actor,
        )

    await cat.upsert_matriz_tasas(
        session,
        [
            CeldaTasaIn(
                producto_id=producto.id, perfil_id=perfil.id, plazo=p,
                tasa=Decimal("0.28"),
            )
            for p in PLAZOS
        ],
        actor_id=actor,
    )
    await cat.upsert_matriz_comisiones(
        session,
        [CeldaComisionIn(
            producto_id=producto.id, perfil_id=perfil.id, comision=Decimal("0.025"),
        )],
        actor_id=actor,
    )

    # ---- Caja principal + capital inicial ----
    caja = await session.scalar(select(Caja).where(Caja.nombre == "Caja Full Demo"))
    if caja is None:
        caja = await crear_caja(
            session, nombre="Caja Full Demo", tipo="efectivo", actor_id=actor,
        )
    await session.commit()

    await registrar_aporte(
        session,
        AporteRetiroIn(
            monto=Decimal("20000000.00"), fecha_negocio=FECHA_INICIO, caja_id=caja.id,
            inversor="Inversores Fundadores", nota="capital inicial seed full",
        ),
        actor_id=actor, idempotency_key=_ikey("aporte-inicial"),
    )

    # ---- Personas + BCRA ----
    # Filtrar a personas con BCRA vigente (sincronizacion OK) para que el
    # cambiar_estado a "aprobada" no falle por bcra_vencido.
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

    # Reasignar los lotes a las personas con BCRA de forma ciclica
    # (garantiza que todos los slots tengan una persona aprobable).
    n_aprobables = len(personas_con_bcra)

    def _persona_para_slot(p_idx: int) -> uuid.UUID:
        if p_idx < n_aprobables:
            return personas_con_bcra[p_idx]
        return personas_con_bcra[p_idx % n_aprobables]

    # ---- Prestamos: crear, desembolsar, devengar comision ----
    prestamos_por_slot: dict[int, Prestamo] = {}  # slot -> Prestamo
    for slot, (p_idx, monto, cuotas, delta_des, offset_pc, _moroso) in enumerate(
        _LOTES_PRESTAMO
    ):
        persona_id = _persona_para_slot(p_idx)
        existente = await session.scalar(
            select(Prestamo)
            .join(SolicitudCredito, Prestamo.solicitud_id == SolicitudCredito.id)
            .where(
                SolicitudCredito.persona_id == persona_id,
                SolicitudCredito.producto_id == producto.id,
            )
        )
        if existente is not None:
            prestamos_por_slot[slot] = existente
            continue

        fecha_des = FECHA_INICIO + timedelta(days=delta_des)
        # Normalizar al primer dia del mes siguiente para evitar dias invalidos
        # (ej. 31 enero + 1 mes no existe en febrero).
        _fpc_raw = fecha_des + timedelta(days=abs(offset_pc))
        if offset_pc < 0:
            _fpc_raw = fecha_des - timedelta(days=abs(offset_pc))
        fecha_pc = _fpc_raw.replace(day=1)

        sol = await orig.crear_solicitud(
            session, persona_id=persona_id, producto_id=producto.id,
            monto=monto, cantidad_cuotas=cuotas,
            vendedor_id=vendedor.id, actor_id=actor,
        )
        await orig.evaluar(session, sol, actor_id=actor)
        await orig.cambiar_estado(
            session, sol, "aprobada", motivo_rechazo=None, actor_id=actor,
        )
        await session.commit()

        out = await desembolsar(
            session, solicitud=sol, caja_id=caja.id,
            fecha_negocio=fecha_des, fecha_primera_cuota=fecha_pc,
            tasa_punitorio_diario=Decimal("0.001"),
            idempotency_key=_ikey(f"des-{slot}"),
            actor_id=actor,
        )
        prestamo = await session.scalar(
            select(Prestamo).where(Prestamo.id == out.prestamo_id)
        )
        assert prestamo is not None
        prestamos_por_slot[slot] = prestamo
        await devengar_por_desembolso(
            session, prestamo=prestamo, solicitud=sol,
            fecha_negocio=fecha_des, actor_id=actor,
        )
        await session.commit()

    # ---- Pagos multi-cuota para lote A (prestamos pagados) ----
    # Lote A: slots 0-4 → pagar todas las cuotas mes a mes
    for slot in range(5):
        prestamo = prestamos_por_slot[slot]
        if prestamo.estado in ("pagado", "cancelado", "novado"):
            continue
        _delta, monto, cuotas, _dd, _pc, _ = _LOTES_PRESTAMO[slot]
        cuota_aprox = (monto * Decimal("1.30") / cuotas).quantize(Decimal("1.00"))
        for n_cuota in range(cuotas):
            fecha_pago = FECHA_INICIO + timedelta(days=35 + n_cuota * 30)
            if fecha_pago > FECHA_ANCLA:
                break
            ikey = _ikey(f"pago-slot{slot}-c{n_cuota}")
            with contextlib.suppress(Exception):
                await registrar_pago(
                    session, prestamo_id=prestamo.id,
                    monto=cuota_aprox, canal="mostrador", caja_id=caja.id,
                    fecha_negocio=fecha_pago, idempotency_key=ikey, actor_id=actor,
                )
            await session.commit()

    # ---- Pagos parciales para lote B (vigentes, algunos con 1-2 pagos) ----
    for slot in range(5, 20):
        prestamo = prestamos_por_slot[slot]
        if prestamo.estado in ("pagado", "cancelado", "novado"):
            continue
        _, monto, cuotas, delta_des, offset_pc, _ = _LOTES_PRESTAMO[slot]
        fecha_des = FECHA_INICIO + timedelta(days=delta_des)
        cuota_aprox = (monto * Decimal("1.28") / cuotas).quantize(Decimal("1.00"))
        # Pagar cuotas que vencieron antes de FECHA_ANCLA
        n_pagadas = max(0, (FECHA_ANCLA - (fecha_des + timedelta(days=offset_pc))).days // 30)
        for k in range(min(n_pagadas, cuotas - 1)):
            fecha_pago = fecha_des + timedelta(days=offset_pc + k * 30 + 5)
            if fecha_pago > FECHA_ANCLA:
                break
            ikey = _ikey(f"pago-slot{slot}-c{k}")
            with contextlib.suppress(Exception):
                await registrar_pago(
                    session, prestamo_id=prestamo.id,
                    monto=cuota_aprox, canal="mostrador", caja_id=caja.id,
                    fecha_negocio=fecha_pago, idempotency_key=ikey, actor_id=actor,
                )
            await session.commit()

    # ---- Lote D: novaciones (refinanciacion y consolidacion) ----
    # slot 20 → refinanciacion
    p_refi = prestamos_por_slot.get(20)
    if p_refi is not None and p_refi.estado == "vigente":
        fecha_nov = FECHA_INICIO + timedelta(days=90)
        with contextlib.suppress(Exception):
            await nov.refinanciar(
                session, prestamo_id=p_refi.id, caja_id=caja.id,
                fecha_negocio=fecha_nov, tasa=Decimal("0.25"),
                cantidad_cuotas=12, periodicidad="mensual",
                fecha_primera_cuota=fecha_nov + timedelta(days=30),
                idempotency_key=_ikey("nov-refi-20"),
                actor_id=actor,
            )

    # slots 21 + 22 → consolidacion
    p_c1 = prestamos_por_slot.get(21)
    p_c2 = prestamos_por_slot.get(22)
    if (
        p_c1 is not None and p_c2 is not None
        and p_c1.estado == "vigente" and p_c2.estado == "vigente"
        and p_c1.persona_id == p_c2.persona_id
    ):
        fecha_nov = FECHA_INICIO + timedelta(days=95)
        with contextlib.suppress(Exception):
            await nov.consolidar(
                session, prestamo_ids=[p_c1.id, p_c2.id], caja_id=caja.id,
                fecha_negocio=fecha_nov, tasa=Decimal("0.27"),
                cantidad_cuotas=12, periodicidad="mensual",
                fecha_primera_cuota=fecha_nov + timedelta(days=30),
                idempotency_key=_ikey("nov-consol-21-22"),
                actor_id=actor,
            )

    await session.commit()

    # ---- Rutas: 3 fechas para cobrador A, 2 fechas para cobrador B ----
    fechas_ruta_a = [
        FECHA_INICIO + timedelta(days=30),
        FECHA_INICIO + timedelta(days=60),
        FECHA_ANCLA,
    ]
    fechas_ruta_b = [
        FECHA_INICIO + timedelta(days=45),
        FECHA_INICIO + timedelta(days=90),
    ]

    for cobrador, fechas in [
        (cobrador_a, fechas_ruta_a),
        (cobrador_b, fechas_ruta_b),
    ]:
        for fecha_ruta in fechas:
            ruta = await session.scalar(
                select(RutaDiaria).where(
                    RutaDiaria.cobrador_id == cobrador.id,
                    RutaDiaria.fecha == fecha_ruta,
                )
            )
            if ruta is None:
                ruta = await generar_ruta(
                    session, cobrador_id=cobrador.id, fecha=fecha_ruta, actor_id=actor,
                )

            paradas = await paradas_de_ruta(session, ruta.id)
            ruta_obj = await obtener_ruta(session, ruta.id)
            assert ruta_obj is not None

            resultados_ciclo = ["pago", "parcial", "ausente", "promesa", "pago"]
            cobros = 0
            for k, p in enumerate(paradas[:5]):
                parada = await obtener_parada(session, p.id)
                if parada is None or parada.visitada_en is not None:
                    continue
                res_visita = resultados_ciclo[k % len(resultados_ciclo)]
                monto_v = Decimal("18000.00") if res_visita in ("pago", "parcial") else None
                try:
                    await visitar(
                        session, ruta=ruta_obj, parada=parada,
                        resultado=res_visita, monto_cobrado=monto_v,
                        foto_url=None, lat=None, lng=None,
                        notas=f"visita full {res_visita}", caja_id=caja.id,
                        fecha_negocio=fecha_ruta, actor_id=cobrador.id,
                    )
                    if monto_v is not None:
                        cobros += 1
                except Exception:  # noqa: BLE001
                    pass

            if cobros:
                try:
                    rendicion = await generar_rendicion(
                        session, ruta_id=ruta.id, fecha_negocio=fecha_ruta,
                        actor_id=cobrador.id,
                    )
                    # Aprobar la rendicion con el admin (nunca con el mismo cobrador)
                    rendicion_obj = await obtener_rendicion(session, rendicion.id)
                    if rendicion_obj is not None and rendicion_obj.estado == "pendiente":
                        await cambiar_estado_rendicion(
                            session, rendicion=rendicion_obj, estado="aprobada",
                            actor_id=actor,
                        )
                except Exception:  # noqa: BLE001
                    pass

            await session.commit()

    # ---- Liquidaciones de comisiones: 3 periodos ----
    periodos = [
        (FECHA_INICIO, FECHA_INICIO + timedelta(days=59)),
        (FECHA_INICIO + timedelta(days=60), FECHA_INICIO + timedelta(days=119)),
        (FECHA_INICIO + timedelta(days=120), FECHA_ANCLA),
    ]
    for k, (desde, hasta) in enumerate(periodos):
        liq = await session.scalar(
            select(ComisionLiquidacion).where(
                ComisionLiquidacion.vendedor_id == vendedor.id,
                ComisionLiquidacion.periodo_desde == desde,
            )
        )
        if liq is None:
            try:
                liq = await generar_liquidacion(
                    session, vendedor_id=vendedor.id,
                    periodo_desde=desde, periodo_hasta=hasta,
                    actor_id=actor,
                )
            except Exception:
                await session.rollback()
                continue

        if liq.estado == "borrador" and liq.monto_total and liq.monto_total > Decimal("0"):
            await aprobar_liquidacion(session, liquidacion=liq, actor_id=actor)
            with contextlib.suppress(Exception):
                await pagar_liquidacion(
                    session, liquidacion_id=liq.id, caja_id=caja.id,
                    fecha_negocio=hasta, idempotency_key=_ikey(f"liq-{k}"),
                    actor_id=actor,
                )
        await session.commit()

    # ---- Snapshots de cartera: una vez por semana en el rango ----
    fecha_snap = FECHA_INICIO
    while fecha_snap <= FECHA_ANCLA:
        try:  # noqa: SIM105
            await generar_snapshot(session, fecha_snap, actor_id=actor)
            await session.commit()
        except Exception:  # noqa: BLE001
            await session.rollback()
        fecha_snap += timedelta(weeks=1)

    # ---- Alertas de mora para cada mes ----
    for mes_offset in range(6):
        fecha_alarma = FECHA_INICIO + timedelta(days=mes_offset * 30)
        try:  # noqa: SIM105
            await procesar_alarmas(session, fecha=fecha_alarma, actor_id=actor)
            await session.commit()
        except Exception:  # noqa: BLE001
            await session.rollback()

    # Alarmas al cierre
    try:  # noqa: SIM105
        await procesar_alarmas(session, fecha=FECHA_ANCLA, actor_id=actor)
        await session.commit()
    except Exception:  # noqa: BLE001
        await session.rollback()

    # ---- CRM: tareas e incidentes para personas morosas (slots 15-19) ----
    for slot in range(15, 20):
        persona_id = _persona_para_slot(_LOTES_PRESTAMO[slot][0])
        with contextlib.suppress(Exception):
            tarea = await crear_tarea(
                session, persona_id=persona_id, operador_id=operador.id,
                titulo=f"Gestionar mora — cliente full slot {slot}",
                descripcion="Contactar al deudor para acordar plan de pago.",
                prioridad="alta",
                vencimiento=FECHA_ANCLA + timedelta(days=7),
                origen="alarma", actor_id=actor, commit=False,
            )
            session.add(tarea)
            await session.flush()

        with contextlib.suppress(Exception):
            await crear_incidente(
                session, persona_id=persona_id,
                tipo="mora",
                titulo=f"Deuda vencida — slot {slot}",
                severidad="alta",
                detalle="Primera cuota vencida, sin contacto desde desembolso.",
                operador_id=operador.id, actor_id=actor,
            )

    await session.commit()

    # ---- Documentos: cronograma y recibo por prestamo (primeros 10 slots) ----
    for slot in range(min(10, len(prestamos_por_slot))):
        prestamo = prestamos_por_slot[slot]
        for tipo in ("cronograma", "recibo"):
            with contextlib.suppress(Exception):
                await docs.generar(
                    session, tipo=tipo, prestamo_id=prestamo.id,
                    actor_id=actor,
                    idempotency_key=_ikey(f"doc-{tipo}-{slot}"),
                )

    await session.commit()

    # ---- Marcador final (crash-safe: se escribe y commitea ultimo) ----
    await _marcar_completo(session)
    await session.commit()

    return await _conteos(session)


async def _conteos(session: AsyncSession) -> dict:
    from sqlalchemy import func

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

    return {
        "personas": await _c(Persona),
        "prestamos": await _c(Prestamo),
        "solicitudes": await _c(SolicitudCredito),
        "pagos": await _c(Pago),
        "alertas": await _c(Alerta),
        "snapshots": await _c(SnapshotCartera),
        "tareas": await _c(Tarea),
        "documentos": await _c(DocumentoEmitido),
    }


async def _reset_marcador(session: AsyncSession) -> None:
    """Elimina el marcador para forzar re-siembra (--reset)."""
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

    reset = "--reset" in sys.argv

    async with async_session_maker() as session:
        if reset:
            await _reset_marcador(session)
        res = await sembrar_full(session)
        await session.commit()

    print("Siembra full completa:", res)  # noqa: T201


if __name__ == "__main__":
    asyncio.run(_main())
