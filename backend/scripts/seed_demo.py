"""Siembra demo determinista e idempotente para NexoCred.

Construye un portafolio realista A TRAVES DE LA CAPA DE SERVICIOS (de modo que se
respeten todas las invariantes de dominio: dinero Decimal, snapshots inmutables,
cronogramas materializados, conservacion de caja). Fechas deterministas (nunca
today()): todo se ancla en FECHA_DEMO.

Idempotente y CRASH-SAFE: el marcador de "ya sembrado" se escribe ULTIMO (tras
commitear el portafolio completo) en `idempotency_key`. Mientras el marcador no
exista, una re-corrida RESUME la siembra: todas las creaciones estructurales son
get-or-create y las operaciones de dinero llevan idempotency_key. Asi un crash a
mitad de camino no deja un portafolio incompleto "congelado".

BCRA: la siembra NO muta PARAMETROS_GLOBALES. Usa un cliente BCRA de siembra que
estampa `fecha_informe` RECIENTE (relativo a date.today()) para que las personas
aprueben naturalmente bajo la vigencia BCRA POR DEFECTO (no debilita el camino LIVE).

Uso:
    cd backend && conda run -n nexocred python -m scripts.seed_demo
"""

import asyncio
import uuid
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.bcra.fake import FakeBcraClient
from app.bcra.puerto import DeudaBcraNormalizada
from app.bcra.servicio import sincronizar_bcra
from app.idempotencia import IdempotencyKey
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
    generar_rendicion,
    generar_ruta,
    obtener_parada,
    obtener_ruta,
    paradas_de_ruta,
    visitar,
)
from app.m07_riesgo.alarmas import procesar as procesar_alarmas
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
from app.m15_catalogo import servicio as cat
from app.m15_catalogo.modelos import PerfilPricing, ProductoCredito
from app.m15_catalogo.schemas import (
    CeldaComisionIn,
    CeldaTasaIn,
    ProductoCreate,
)
from app.modelos_stub import Prestamo, RutaDiaria, SolicitudCredito

# ---- Anclas deterministas (nunca today()) ----
FECHA_DEMO = date(2026, 6, 1)
SEMILLA_DEFECTO = 42
ADMIN_DEMO_EMAIL = "admin.demo@nexocred.test"
N_PERSONAS = 20
ROLES = ("admin", "analista", "cobrador", "vendedor", "operador", "tesoreria")
PLAZOS = (3, 6, 12)

# Marcador de finalizacion TOTAL de la siembra (se escribe ULTIMO). _ya_sembrado
# lo consulta; mientras no exista, la siembra resume. Vive en idempotency_key.
MARCADOR_COMPLETO = "seed_demo_completo"
_MARCADOR_OP = "seed"


class _SeedBcraClient:
    """Cliente BCRA de siembra: delega los montos/situaciones en el fake
    determinista pero re-estampa `fecha_informe` a una fecha RECIENTE (relativa a
    date.today()), de modo que las personas sembradas aprueben bajo la vigencia
    BCRA POR DEFECTO (30 dias) sin tocar PARAMETROS_GLOBALES."""

    def __init__(self) -> None:
        self._fake = FakeBcraClient()

    async def consultar(self, cuil: str) -> list[DeudaBcraNormalizada]:
        hoy = date.today()
        deudas = await self._fake.consultar(cuil)
        return [
            DeudaBcraNormalizada(
                entidad=d.entidad, monto=d.monto, situacion=d.situacion,
                fecha_informe=hoy,
            )
            for d in deudas
        ]


def _cuil_demo(indice: int) -> str:
    """CUIL valido y determinista a partir de un indice (DNI = 30000000 + indice)."""
    dni = 30_000_000 + indice
    base = "20" + str(dni)
    dv = calcular_digito_verificador(base)
    return base + str(dv)


def _persona_payload(indice: int) -> PersonaCreate:
    cuil = _cuil_demo(indice)
    return PersonaCreate(
        apellido=f"Demo{indice:02d}",
        nombre=f"Cliente{indice:02d}",
        dni=str(30_000_000 + indice),
        cuil=cuil,
        fecha_nac=date(1985, (indice % 12) + 1, (indice % 27) + 1),
        estado_civil="soltero",
        email=f"cliente{indice:02d}@demo.test",
        telefono=f"11{indice:08d}"[:11],
        domicilio_calle="Av Demo",
        domicilio_numero=str(100 + indice),
        domicilio_localidad="CABA",
        domicilio_provincia="Buenos Aires",
        tipo_vivienda="propia",
        ingresos_declarados=Decimal("400000.00"),
        ingresos_en_blanco=Decimal("300000.00"),
        ingresos_totales=Decimal("400000.00"),
        referencias=[
            ReferenciaIn(
                nombre="Ref", apellido=f"Demo{indice:02d}",
                telefono="1199887766", vinculo="madre",
            )
        ],
    )


async def _asegurar_roles(session: AsyncSession) -> None:
    for nombre in ROLES:
        existe = await session.scalar(select(Rol).where(Rol.nombre == nombre))
        if existe is None:
            session.add(Rol(nombre=nombre))
    await session.flush()


async def _ya_sembrado(session: AsyncSession) -> bool:
    """True solo si la siembra COMPLETO (marcador escrito ultimo). Si la siembra
    crasheo a mitad de camino, el marcador no existe y se resume."""
    marcador = await session.scalar(
        select(IdempotencyKey).where(
            IdempotencyKey.clave == MARCADOR_COMPLETO,
            IdempotencyKey.operacion == _MARCADOR_OP,
        )
    )
    return marcador is not None


async def _marcar_completo(session: AsyncSession) -> None:
    """Escribe el marcador de finalizacion total. Idempotente (no duplica)."""
    ya = await session.scalar(
        select(IdempotencyKey).where(
            IdempotencyKey.clave == MARCADOR_COMPLETO,
            IdempotencyKey.operacion == _MARCADOR_OP,
        )
    )
    if ya is None:
        session.add(
            IdempotencyKey(
                clave=MARCADOR_COMPLETO, operacion=_MARCADOR_OP, respuesta_json=None
            )
        )
        await session.flush()


async def _get_or_create_usuario(
    session: AsyncSession, *, email: str, nombre: str, roles: list[str],
    actor_id: uuid.UUID | None,
) -> Usuario:
    """Get-or-create por email (la siembra es resumible tras un crash parcial)."""
    existente = await session.scalar(select(Usuario).where(Usuario.email == email))
    if existente is not None:
        return existente
    return await crear_usuario(
        session, email=email, nombre=nombre, password="demo12345",
        roles=roles, actor_id=actor_id,
    )


async def sembrar_demo(session: AsyncSession, *, semilla: int = SEMILLA_DEFECTO) -> dict:
    """Construye el portafolio demo a traves de los servicios. Idempotente.

    Devuelve un dict con los conteos sembrados.
    """
    if await _ya_sembrado(session):
        return await _conteos(session)

    await _asegurar_roles(session)

    # --- Usuarios (uno por rol) — get-or-create (resumible tras crash parcial) ---
    admin = await _get_or_create_usuario(
        session, email=ADMIN_DEMO_EMAIL, nombre="Admin Demo",
        roles=["admin"], actor_id=None,
    )
    actor = admin.id
    vendedor = await _get_or_create_usuario(
        session, email="vendedor.demo@nexocred.test", nombre="Vendedor Demo",
        roles=["vendedor"], actor_id=actor,
    )
    cobrador = await _get_or_create_usuario(
        session, email="cobrador.demo@nexocred.test", nombre="Cobrador Demo",
        roles=["cobrador"], actor_id=actor,
    )
    for rol in ("analista", "operador", "tesoreria"):
        await _get_or_create_usuario(
            session, email=f"{rol}.demo@nexocred.test", nombre=f"{rol.title()} Demo",
            roles=[rol], actor_id=actor,
        )

    # --- Producto + perfil + matrices (tasa y comision) — get-or-create ---
    producto = await session.scalar(
        select(ProductoCredito).where(
            ProductoCredito.nombre == "Prestamo Personal Demo"
        )
    )
    if producto is None:
        producto = await cat.crear_producto(
            session,
            ProductoCreate(
                nombre="Prestamo Personal Demo", periodicidad="mensual",
                plazos_permitidos=list(PLAZOS),
                monto_minimo=Decimal("10000.00"), monto_maximo=Decimal("2000000.00"),
            ),
            actor_id=actor,
        )
        await cat.publicar_producto(session, producto, actor_id=actor)
    perfil = await session.scalar(
        select(PerfilPricing).where(PerfilPricing.nombre == "Estandar Demo")
    )
    if perfil is None:
        perfil = await cat.crear_perfil(
            session, nombre="Estandar Demo", descripcion=None, orden=1, actor_id=actor,
        )
    await cat.upsert_matriz_tasas(
        session,
        [
            CeldaTasaIn(
                producto_id=producto.id, perfil_id=perfil.id, plazo=p, tasa=Decimal("0.30")
            )
            for p in PLAZOS
        ],
        actor_id=actor,
    )
    await cat.upsert_matriz_comisiones(
        session,
        [CeldaComisionIn(producto_id=producto.id, perfil_id=perfil.id, comision=Decimal("0.02"))],
        actor_id=actor,
    )

    # --- Caja + aporte de capital (tesoreria) — get-or-create ---
    caja = await session.scalar(
        select(Caja).where(Caja.nombre == "Caja Central Demo")
    )
    if caja is None:
        caja = await crear_caja(
            session, nombre="Caja Central Demo", tipo="efectivo", actor_id=actor
        )
    await session.commit()
    # idempotency_key → re-correr no duplica el aporte.
    await registrar_aporte(
        session,
        AporteRetiroIn(
            monto=Decimal("5000000.00"), fecha_negocio=FECHA_DEMO, caja_id=caja.id,
            inversor="Socio Fundador", nota="capital inicial demo",
        ),
        actor_id=actor, idempotency_key=f"demo-aporte-{semilla}",
    )

    # --- Personas + BCRA — get-or-create por CUIL; BCRA con fecha_informe reciente
    #     (aprueban bajo vigencia DEFAULT sin tocar PARAMETROS_GLOBALES). ---
    bcra = _SeedBcraClient()
    personas: list[uuid.UUID] = []
    personas_con_bcra: list[uuid.UUID] = []
    for i in range(N_PERSONAS):
        cuil = _cuil_demo(i)
        persona = await session.scalar(select(Persona).where(Persona.cuil == cuil))
        if persona is None:
            persona = await crear_persona(session, _persona_payload(i), actor_id=actor)
        # BCRA: solo sincronizar si la persona aun no tiene reporte (resumible).
        ya_bcra = await session.scalar(
            select(PersonaDeudaBcra.id).where(PersonaDeudaBcra.persona_id == persona.id)
        )
        if ya_bcra is None:
            filas = await sincronizar_bcra(session, persona.id, bcra, actor_id=actor)
            tiene_bcra = bool(filas)
        else:
            tiene_bcra = True
        personas.append(persona.id)
        if tiene_bcra:  # solo las que tienen reporte BCRA son aprobables (vigencia)
            personas_con_bcra.append(persona.id)
    await session.commit()

    # --- Solicitudes -> evaluar -> aprobar -> desembolsar ---
    # Una porcion de las personas obtiene prestamo; algunas con mora (primera cuota
    # vencida respecto de FECHA_DEMO) para que La Torre tenga senial de riesgo.
    prestamos: list[Prestamo] = []
    n_prestamos = min(12, len(personas_con_bcra))
    for i in range(n_prestamos):
        persona_id = personas_con_bcra[i]
        # Resumible: si la persona ya tiene un prestamo (siembra previa parcial),
        # lo reutilizamos en vez de crear una solicitud duplicada.
        existente = await session.scalar(
            select(Prestamo).where(Prestamo.persona_id == persona_id)
        )
        if existente is not None:
            prestamos.append(existente)
            continue
        sol = await orig.crear_solicitud(
            session, persona_id=persona_id, producto_id=producto.id,
            monto=Decimal("100000.00"), cantidad_cuotas=6,
            vendedor_id=vendedor.id, actor_id=actor,
        )
        await orig.evaluar(session, sol, actor_id=actor)
        await orig.cambiar_estado(
            session, sol, "aprobada", motivo_rechazo=None, actor_id=actor
        )
        await session.commit()

        # Mora: los primeros 4 prestamos tienen primera cuota muy atrasada.
        if i < 4:
            # primera cuota vencio hace ~45 dias respecto de FECHA_DEMO
            fpc = FECHA_DEMO - timedelta(days=45)
            fneg = FECHA_DEMO - timedelta(days=75)
        else:
            fpc = FECHA_DEMO + timedelta(days=30)
            fneg = FECHA_DEMO
        out = await desembolsar(
            session, solicitud=sol, caja_id=caja.id, fecha_negocio=fneg,
            fecha_primera_cuota=fpc, tasa_punitorio_diario=Decimal("0.001"),
            idempotency_key=f"demo-des-{semilla}-{i}", actor_id=actor,
        )
        prestamo = await session.scalar(
            select(Prestamo).where(Prestamo.id == out.prestamo_id)
        )
        assert prestamo is not None
        prestamos.append(prestamo)
        # Comision de originacion del vendedor.
        await devengar_por_desembolso(
            session, prestamo=prestamo, solicitud=sol, fecha_negocio=fneg, actor_id=actor
        )
        await session.commit()

    # --- Pagos (algunos prestamos al dia pagan; los morosos no) ---
    for i, prestamo in enumerate(prestamos):
        if i < 4:
            continue  # morosos: dejamos la mora abierta
        await registrar_pago(
            session, prestamo_id=prestamo.id, monto=Decimal("20000.00"),
            canal="mostrador", caja_id=caja.id, fecha_negocio=FECHA_DEMO,
            idempotency_key=f"demo-pago-{semilla}-{i}", actor_id=actor,
        )

    # --- Ruta + visitas + rendicion (cobrador) — get-or-create de la ruta ---
    ruta = await session.scalar(
        select(RutaDiaria).where(
            RutaDiaria.cobrador_id == cobrador.id, RutaDiaria.fecha == FECHA_DEMO
        )
    )
    if ruta is None:
        ruta = await generar_ruta(
            session, cobrador_id=cobrador.id, fecha=FECHA_DEMO, actor_id=actor
        )
        paradas = await paradas_de_ruta(session, ruta.id)
        ruta_obj = await obtener_ruta(session, ruta.id)
        assert ruta_obj is not None
        cobros_ruta = 0
        for p in paradas[:3]:
            parada = await obtener_parada(session, p.id)
            assert parada is not None
            await visitar(
                session, ruta=ruta_obj, parada=parada, resultado="pago",
                monto_cobrado=Decimal("15000.00"), foto_url=None, lat=None, lng=None,
                notas="cobro demo", caja_id=caja.id, fecha_negocio=FECHA_DEMO,
                actor_id=actor,
            )
            cobros_ruta += 1
        if cobros_ruta:
            await generar_rendicion(
                session, ruta_id=ruta.id, fecha_negocio=FECHA_DEMO, actor_id=actor
            )

    # --- Liquidacion de comisiones del vendedor + pago — get-or-create ---
    liq = await session.scalar(
        select(ComisionLiquidacion).where(
            ComisionLiquidacion.vendedor_id == vendedor.id
        )
    )
    if liq is None:
        liq = await generar_liquidacion(
            session, vendedor_id=vendedor.id,
            periodo_desde=FECHA_DEMO - timedelta(days=90),
            periodo_hasta=FECHA_DEMO + timedelta(days=1), actor_id=actor,
        )
    if (
        liq.monto_total
        and liq.monto_total > Decimal("0")
        and liq.estado == "borrador"
    ):
        await aprobar_liquidacion(session, liquidacion=liq, actor_id=actor)
        await pagar_liquidacion(
            session, liquidacion_id=liq.id, caja_id=caja.id, fecha_negocio=FECHA_DEMO,
            idempotency_key=f"demo-liq-{semilla}", actor_id=actor,
        )

    # --- Alertas de mora (riesgo) ---
    await procesar_alarmas(session, fecha=FECHA_DEMO, actor_id=actor)

    # --- Marcador de finalizacion TOTAL: se escribe ULTIMO y se commitea junto al
    #     resto. Solo tras este commit `_ya_sembrado` devuelve True. ---
    await _marcar_completo(session)
    await session.commit()
    return await _conteos(session)


async def _conteos(session: AsyncSession) -> dict:
    from sqlalchemy import func

    from app.m01_personas.modelos import Persona
    from app.modelos_stub import Alerta, Pago

    async def _c(modelo) -> int:
        return await session.scalar(select(func.count()).select_from(modelo)) or 0

    return {
        "personas": await _c(Persona),
        "prestamos": await _c(Prestamo),
        "pagos": await _c(Pago),
        "alertas": await _c(Alerta),
        "cajas": await _c(Caja),
        "solicitudes": await _c(SolicitudCredito),
    }


async def _main() -> None:
    from app.db import async_session_maker

    async with async_session_maker() as session:
        res = await sembrar_demo(session)
        await session.commit()
    print("Siembra demo completa:", res)  # noqa: T201


if __name__ == "__main__":
    asyncio.run(_main())
