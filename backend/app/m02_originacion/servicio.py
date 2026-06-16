import uuid
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auditoria import escribir_evento
from app.errors import ErrorAPI
from app.m01_personas.modelos import Persona, PersonaDeudaBcra, PersonaMarca
from app.m15_catalogo import servicio as cat
from app.m15_catalogo.modelos import PerfilPricing
from app.m15_catalogo.schemas import SimuladorLibreIn, SimuladorOut
from app.m16_maestros.modelos import AsignacionVendedor
from app.modelos_stub import Prestamo, SolicitudCredito

# Transiciones validas de solicitud (§5.6). 'desembolsada' es disparada por desembolso.
TRANSICIONES: dict[str, set[str]] = {
    "borrador": {"en_analisis", "desistida"},
    "en_analisis": {"aprobada", "rechazada", "desistida"},
    "aprobada": {"desembolsada", "desistida"},
    "rechazada": set(),
    "desistida": set(),
    "desembolsada": set(),
}


def _parametros() -> dict:
    from app.m12_auth.router import PARAMETROS_GLOBALES

    return PARAMETROS_GLOBALES


async def _zona_sector_de_vendedor(
    session: AsyncSession, vendedor_id: uuid.UUID
) -> tuple[uuid.UUID | None, uuid.UUID | None]:
    res = await session.execute(
        select(AsignacionVendedor.zona_id, AsignacionVendedor.sector_id)
        .where(
            AsignacionVendedor.vendedor_id == vendedor_id,
            AsignacionVendedor.vigente_hasta.is_(None),
        )
        .limit(1)
    )
    row = res.one_or_none()
    if row is None:
        return None, None
    return row.zona_id, row.sector_id


async def obtener_solicitud(
    session: AsyncSession, solicitud_id: uuid.UUID
) -> SolicitudCredito | None:
    res = await session.execute(
        select(SolicitudCredito).where(SolicitudCredito.id == solicitud_id)
    )
    return res.scalar_one_or_none()


async def crear_solicitud(
    session: AsyncSession,
    *,
    persona_id: uuid.UUID,
    producto_id: uuid.UUID,
    monto: Decimal,
    cantidad_cuotas: int,
    vendedor_id: uuid.UUID | None,
    actor_id: uuid.UUID | None,
    zona_id: uuid.UUID | None = None,
    sector_id: uuid.UUID | None = None,
) -> SolicitudCredito:
    if vendedor_id is not None and (zona_id is None or sector_id is None):
        z, s = await _zona_sector_de_vendedor(session, vendedor_id)
        zona_id = zona_id or z
        sector_id = sector_id or s
    sol = SolicitudCredito(
        persona_id=persona_id,
        producto_id=producto_id,
        monto=monto,
        cantidad_cuotas=cantidad_cuotas,
        vendedor_id=vendedor_id,
        zona_id=zona_id,
        sector_id=sector_id,
        estado="borrador",
    )
    session.add(sol)
    await session.flush()
    await escribir_evento(
        session, actor_id=actor_id, accion="solicitud_alta",
        entidad="solicitud_credito", entidad_id=sol.id,
    )
    return sol


async def listar_solicitudes(
    session: AsyncSession,
    *,
    estado: str | None = None,
    vendedor_id: uuid.UUID | None = None,
) -> list[SolicitudCredito]:
    stmt = select(SolicitudCredito).order_by(SolicitudCredito.created_at.desc())
    if estado is not None:
        stmt = stmt.where(SolicitudCredito.estado == estado)
    if vendedor_id is not None:
        stmt = stmt.where(SolicitudCredito.vendedor_id == vendedor_id)
    res = await session.execute(stmt)
    return list(res.scalars().all())


async def _bcra_vigente(session: AsyncSession, persona_id: uuid.UUID) -> bool:
    res = await session.execute(
        select(PersonaDeudaBcra.fecha_informe)
        .where(PersonaDeudaBcra.persona_id == persona_id)
        .order_by(PersonaDeudaBcra.fecha_informe.desc())
        .limit(1)
    )
    fecha = res.scalar_one_or_none()
    if fecha is None:
        return False
    vigencia = int(_parametros().get("bcra_vigencia_dias", 30))
    return fecha >= date.today() - timedelta(days=vigencia)


async def _peor_situacion_bcra(session: AsyncSession, persona_id: uuid.UUID) -> int | None:
    res = await session.execute(
        select(PersonaDeudaBcra.situacion).where(
            PersonaDeudaBcra.persona_id == persona_id
        )
    )
    situaciones = [s for s in res.scalars().all()]
    return max(situaciones) if situaciones else None


def _edad(fecha_nac: date, ref: date) -> int:
    return ref.year - fecha_nac.year - (
        (ref.month, ref.day) < (fecha_nac.month, fecha_nac.day)
    )


async def validar_politicas(
    session: AsyncSession, solicitud: SolicitudCredito
) -> dict:
    persona = (
        await session.execute(select(Persona).where(Persona.id == solicitud.persona_id))
    ).scalar_one()

    edad = _edad(persona.fecha_nac, date.today())
    edad_ok = 18 <= edad <= 75

    # cuota/ingreso: estimacion simple cuota = monto/cantidad_cuotas vs 35% del ingreso.
    cuotas = solicitud.cantidad_cuotas or 1
    monto = solicitud.monto or Decimal("0")
    cuota_estimada = monto / Decimal(cuotas)
    ingreso = persona.ingresos_totales or Decimal("0")
    cuota_ingreso_ok = ingreso > 0 and cuota_estimada <= ingreso * Decimal("0.35")

    bcra_ok = await _bcra_vigente(session, solicitud.persona_id)

    # mora previa: marca lista_negra/observado activa o situacion BCRA >= 3.
    marcas = (
        await session.execute(
            select(PersonaMarca).where(
                PersonaMarca.persona_id == solicitud.persona_id,
                PersonaMarca.activa.is_(True),
                PersonaMarca.tipo.in_(["lista_negra", "observado"]),
            )
        )
    ).scalars().all()
    peor = await _peor_situacion_bcra(session, solicitud.persona_id)
    mora_previa_ok = not marcas and (peor is None or peor < 3)

    return {
        "edad": edad_ok,
        "cuota_ingreso": cuota_ingreso_ok,
        "bcra": bcra_ok,
        "mora_previa": mora_previa_ok,
    }


def calcular_score(checklist: dict, situacion_bcra: int | None) -> int:
    """Scoring interno deterministico (0-100). Heuristica documentada:
    +30 edad ok, +30 cuota/ingreso ok, +20 sin mora previa, +20 BCRA situacion buena.
    Bandas de perfil: >=80 perfil orden 1, 60-79 orden 2, <60 orden 3 (o el de mayor orden)."""
    score = 0
    if checklist["edad"]:
        score += 30
    if checklist["cuota_ingreso"]:
        score += 30
    if checklist["mora_previa"]:
        score += 20
    if situacion_bcra is None or situacion_bcra <= 2:
        score += 20
    elif situacion_bcra <= 3:
        score += 10
    return score


async def _perfil_por_banda(session: AsyncSession, score: int) -> PerfilPricing:
    perfiles = (
        await session.execute(
            select(PerfilPricing)
            .where(PerfilPricing.activo.is_(True))
            .order_by(PerfilPricing.orden)
        )
    ).scalars().all()
    if not perfiles:
        raise ErrorAPI(
            "perfil_no_definido",
            "no hay perfiles de pricing activos para asignar",
            status=422,
        )
    # mejor score -> mejor perfil (orden menor). Banda: 0=>=80, 1=60-79, 2+=resto.
    if score >= 80:
        idx = 0
    elif score >= 60:
        idx = 1
    else:
        idx = 2
    idx = min(idx, len(perfiles) - 1)
    return perfiles[idx]


async def evaluar(
    session: AsyncSession, solicitud: SolicitudCredito, *, actor_id: uuid.UUID | None
) -> SolicitudCredito:
    if solicitud.estado not in ("borrador", "en_analisis"):
        raise ErrorAPI(
            "transicion_invalida",
            f"no se puede evaluar una solicitud en estado {solicitud.estado}",
            status=409,
        )
    checklist = await validar_politicas(session, solicitud)
    situacion = await _peor_situacion_bcra(session, solicitud.persona_id)
    score = calcular_score(checklist, situacion)
    perfil = await _perfil_por_banda(session, score)
    tasa = await cat.resolver_tasa(
        session, solicitud.producto_id, perfil.id, solicitud.cantidad_cuotas or 0
    )
    if tasa is None:
        raise ErrorAPI(
            "tasa_no_definida",
            "no hay tasa en la matriz para producto/perfil/plazo de la solicitud",
            status=422,
        )
    solicitud.score = score
    solicitud.perfil_pricing_id = perfil.id
    solicitud.tasa_resuelta = tasa
    if solicitud.estado == "borrador":
        solicitud.estado = "en_analisis"
    await session.flush()
    await escribir_evento(
        session, actor_id=actor_id, accion="solicitud_evaluacion",
        entidad="solicitud_credito", entidad_id=solicitud.id,
        metadata_json={"score": score, "perfil_id": str(perfil.id)},
    )
    return solicitud


async def simular_oferta(
    session: AsyncSession, solicitud: SolicitudCredito, fecha_primera_cuota: date
) -> SimuladorOut:
    if solicitud.tasa_resuelta is None:
        raise ErrorAPI(
            "solicitud_no_evaluada",
            "debe evaluarse la solicitud antes de simular la oferta",
            status=409,
        )
    libre = SimuladorLibreIn(
        capital=solicitud.monto or Decimal("0"),
        tasa_interes_directo=solicitud.tasa_resuelta,
        cantidad_cuotas=solicitud.cantidad_cuotas or 1,
        periodicidad="mensual",
        fecha_primera_cuota=fecha_primera_cuota,
    )
    return cat.simular_libre(libre)


async def cambiar_estado(
    session: AsyncSession,
    solicitud: SolicitudCredito,
    nuevo: str,
    *,
    motivo_rechazo: str | None,
    actor_id: uuid.UUID | None,
) -> SolicitudCredito:
    actual = solicitud.estado
    permitidos = TRANSICIONES.get(actual, set())
    if nuevo not in permitidos:
        raise ErrorAPI(
            "transicion_invalida",
            f"transicion {actual} -> {nuevo} no permitida",
            status=409,
            details={"estado_actual": actual, "permitidos": sorted(permitidos)},
        )
    if nuevo == "aprobada" and not await _bcra_vigente(session, solicitud.persona_id):
        raise ErrorAPI(
            "bcra_vencido",
            "no se puede aprobar sin BCRA sincronizado dentro de la vigencia",
            status=409,
        )
    solicitud.estado = nuevo
    if nuevo == "rechazada":
        solicitud.motivo_rechazo = motivo_rechazo
    await session.flush()
    await escribir_evento(
        session, actor_id=actor_id, accion=f"solicitud_{nuevo}",
        entidad="solicitud_credito", entidad_id=solicitud.id,
        metadata_json={"de": actual, "a": nuevo},
    )
    return solicitud


# desembolso se implementa en servicio_desembolso para mantener foco (Task 5).
async def obtener_prestamo_de_solicitud(
    session: AsyncSession, solicitud_id: uuid.UUID
) -> Prestamo | None:
    res = await session.execute(
        select(Prestamo).where(Prestamo.solicitud_id == solicitud_id)
    )
    return res.scalar_one_or_none()
