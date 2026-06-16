import uuid
from typing import Annotated

from fastapi import APIRouter, Header, Query

from app.deps import (
    OriginaSolicitud,
    AnalistaRiesgo,
    CurrentUser,
    SessionDep,
    scope_vendedor,
)
from app.errors import ErrorAPI
from app.m02_originacion import servicio
from app.m02_originacion.schemas import (
    CambioEstadoIn,
    ChecklistOut,
    DesembolsarIn,
    DesembolsoOut,
    SimularIn,
    SolicitudCreate,
    SolicitudOut,
)
from app.m02_originacion.servicio_desembolso import desembolsar
from app.m15_catalogo.schemas import SimuladorOut
from app.paginacion import Pagina, paginar


def _exigir_idem(idempotency_key: str | None) -> str:
    if not idempotency_key:
        raise ErrorAPI(
            "idempotency_key_requerida",
            "esta operacion requiere header Idempotency-Key",
            status=400,
        )
    return idempotency_key

router = APIRouter(tags=["originacion"])


async def _get_solicitud(session, solicitud_id: uuid.UUID):
    sol = await servicio.obtener_solicitud(session, solicitud_id)
    if sol is None:
        raise ErrorAPI("solicitud_no_encontrada", "solicitud inexistente", status=404)
    return sol


def _es_vendedor(actor) -> bool:
    return any(r.nombre == "vendedor" for r in actor.roles)


@router.post("/solicitudes", response_model=SolicitudOut, status_code=201)
async def crear_solicitud(
    datos: SolicitudCreate, session: SessionDep, actor: OriginaSolicitud
) -> SolicitudOut:
    # Atribución del vendedor: un vendedor SIEMPRE origina a su propio nombre
    # (no puede crear a nombre de otro). Admin/analista pueden fijar el vendedor
    # explícitamente vía body; si no lo hacen, queda sin vendedor.
    vendedor_id = actor.id if _es_vendedor(actor) else datos.vendedor_id
    sol = await servicio.crear_solicitud(
        session,
        persona_id=datos.persona_id,
        producto_id=datos.producto_id,
        monto=datos.monto,
        cantidad_cuotas=datos.cantidad_cuotas,
        vendedor_id=vendedor_id,
        actor_id=actor.id,
    )
    await session.commit()
    return SolicitudOut.model_validate(sol)


@router.get("/solicitudes", response_model=Pagina[SolicitudOut])
async def listar_solicitudes(
    session: SessionDep,
    actor: CurrentUser,
    estado: Annotated[str | None, Query()] = None,
    vendedor_id: Annotated[uuid.UUID | None, Query()] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
) -> Pagina[SolicitudOut]:
    # Scope por vendedor: un vendedor puro solo ve lo suyo; admin/analista/ceo
    # ven todo o filtran libremente vía ?vendedor_id.
    filtro_vendedor = scope_vendedor(actor, vendedor_id)
    sols = await servicio.listar_solicitudes(
        session, estado=estado, vendedor_id=filtro_vendedor
    )
    return paginar([SolicitudOut.model_validate(s) for s in sols], page, per_page)


@router.get("/solicitudes/{solicitud_id}", response_model=SolicitudOut)
async def detalle_solicitud(
    solicitud_id: uuid.UUID, session: SessionDep, _: CurrentUser
) -> SolicitudOut:
    sol = await _get_solicitud(session, solicitud_id)
    return SolicitudOut.model_validate(sol)


@router.patch("/solicitudes/{solicitud_id}/estado", response_model=SolicitudOut)
async def cambiar_estado(
    solicitud_id: uuid.UUID,
    datos: CambioEstadoIn,
    session: SessionDep,
    actor: AnalistaRiesgo,
) -> SolicitudOut:
    sol = await _get_solicitud(session, solicitud_id)
    await servicio.cambiar_estado(
        session, sol, datos.estado,
        motivo_rechazo=datos.motivo_rechazo, actor_id=actor.id,
    )
    await session.commit()
    return SolicitudOut.model_validate(sol)


@router.get("/solicitudes/{solicitud_id}/validar-politicas", response_model=ChecklistOut)
async def validar_politicas(
    solicitud_id: uuid.UUID, session: SessionDep, _: AnalistaRiesgo
) -> ChecklistOut:
    sol = await _get_solicitud(session, solicitud_id)
    checklist = await servicio.validar_politicas(session, sol)
    return ChecklistOut(**checklist)


@router.post("/solicitudes/{solicitud_id}/evaluar", response_model=SolicitudOut)
async def evaluar(
    solicitud_id: uuid.UUID, session: SessionDep, actor: AnalistaRiesgo
) -> SolicitudOut:
    sol = await _get_solicitud(session, solicitud_id)
    await servicio.evaluar(session, sol, actor_id=actor.id)
    await session.commit()
    return SolicitudOut.model_validate(sol)


@router.post("/solicitudes/{solicitud_id}/simular", response_model=SimuladorOut)
async def simular(
    solicitud_id: uuid.UUID,
    datos: SimularIn,
    session: SessionDep,
    _: AnalistaRiesgo,
) -> SimuladorOut:
    sol = await _get_solicitud(session, solicitud_id)
    return await servicio.simular_oferta(session, sol, datos.fecha_primera_cuota)


@router.post(
    "/solicitudes/{solicitud_id}/desembolsar",
    response_model=DesembolsoOut,
    status_code=201,
)
async def desembolsar_solicitud(
    solicitud_id: uuid.UUID,
    datos: DesembolsarIn,
    session: SessionDep,
    actor: AnalistaRiesgo,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> DesembolsoOut:
    clave = _exigir_idem(idempotency_key)
    sol = await _get_solicitud(session, solicitud_id)
    return await desembolsar(
        session,
        solicitud=sol,
        caja_id=datos.caja_id,
        fecha_negocio=datos.fecha_negocio,
        fecha_primera_cuota=datos.fecha_primera_cuota,
        tasa_punitorio_diario=datos.tasa_punitorio_diario,
        idempotency_key=clave,
        actor_id=actor.id,
    )
