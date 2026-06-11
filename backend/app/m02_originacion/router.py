import uuid

from fastapi import APIRouter, Query

from app.deps import AdminOAnalista, CurrentUser, SessionDep
from app.errors import ErrorAPI
from app.m02_originacion import servicio
from app.m02_originacion.schemas import (
    CambioEstadoIn,
    ChecklistOut,
    SimularIn,
    SolicitudCreate,
    SolicitudOut,
)
from app.m15_catalogo.schemas import SimuladorOut

router = APIRouter(tags=["originacion"])


async def _get_solicitud(session, solicitud_id: uuid.UUID):
    sol = await servicio.obtener_solicitud(session, solicitud_id)
    if sol is None:
        raise ErrorAPI("solicitud_no_encontrada", "solicitud inexistente", status=404)
    return sol


@router.post("/solicitudes", response_model=SolicitudOut, status_code=201)
async def crear_solicitud(
    datos: SolicitudCreate, session: SessionDep, actor: AdminOAnalista
) -> SolicitudOut:
    sol = await servicio.crear_solicitud(
        session,
        persona_id=datos.persona_id,
        producto_id=datos.producto_id,
        monto=datos.monto,
        cantidad_cuotas=datos.cantidad_cuotas,
        vendedor_id=datos.vendedor_id,
        actor_id=actor.id,
    )
    await session.commit()
    return SolicitudOut.model_validate(sol)


@router.get("/solicitudes", response_model=list[SolicitudOut])
async def listar_solicitudes(
    session: SessionDep,
    _: CurrentUser,
    estado: str | None = Query(default=None),
) -> list[SolicitudOut]:
    sols = await servicio.listar_solicitudes(session, estado=estado)
    return [SolicitudOut.model_validate(s) for s in sols]


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
    actor: AdminOAnalista,
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
    solicitud_id: uuid.UUID, session: SessionDep, _: AdminOAnalista
) -> ChecklistOut:
    sol = await _get_solicitud(session, solicitud_id)
    checklist = await servicio.validar_politicas(session, sol)
    return ChecklistOut(**checklist)


@router.post("/solicitudes/{solicitud_id}/evaluar", response_model=SolicitudOut)
async def evaluar(
    solicitud_id: uuid.UUID, session: SessionDep, actor: AdminOAnalista
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
    _: AdminOAnalista,
) -> SimuladorOut:
    sol = await _get_solicitud(session, solicitud_id)
    return await servicio.simular_oferta(session, sol, datos.fecha_primera_cuota)
