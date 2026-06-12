import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.deps import SessionDep, requiere_rol
from app.errors import ErrorAPI
from app.m08_crm import servicio
from app.m08_crm.schemas import (
    AsignacionIn,
    AsignacionMasivaIn,
    AsignacionOut,
    CompletarTareaIn,
    IncidenteIn,
    IncidenteOut,
    IncidentePatch,
    InteraccionIn,
    InteraccionOut,
    ProspectoIn,
    ProspectoOut,
    ProspectoPatch,
    TareaIn,
    TareaOut,
    TareaPatch,
    TimelineEvento,
)
from app.m12_auth.modelos import Usuario

router = APIRouter(tags=["crm"])

CrmUser = Annotated[Usuario, Depends(requiere_rol("admin", "operador"))]
AdminUser = Annotated[Usuario, Depends(requiere_rol("admin"))]


def _es_admin(usuario: Usuario) -> bool:
    return any(r.nombre == "admin" for r in usuario.roles)


# ---------- Tareas ----------
@router.get("/tareas", response_model=list[TareaOut])
async def listar_tareas(
    session: SessionDep,
    actor: CrmUser,
    estado: Annotated[str | None, Query()] = None,
) -> list[TareaOut]:
    operador = None if _es_admin(actor) else actor.id
    tareas = await servicio.listar_tareas(
        session, operador_id=operador, estado=estado
    )
    return [TareaOut.model_validate(t) for t in tareas]


@router.post("/tareas", response_model=TareaOut, status_code=201)
async def crear_tarea(
    datos: TareaIn, session: SessionDep, actor: CrmUser
) -> TareaOut:
    tarea = await servicio.crear_tarea(
        session, persona_id=datos.persona_id,
        operador_id=datos.operador_id or actor.id, titulo=datos.titulo,
        descripcion=datos.descripcion, prioridad=datos.prioridad,
        vencimiento=datos.vencimiento, actor_id=actor.id,
    )
    return TareaOut.model_validate(tarea)


async def _get_tarea(session, tarea_id: uuid.UUID, actor: Usuario):
    tarea = await servicio.obtener_tarea(session, tarea_id)
    if tarea is None:
        raise ErrorAPI("tarea_no_encontrada", "tarea inexistente", status=404)
    if not _es_admin(actor) and tarea.operador_id not in (None, actor.id):
        raise ErrorAPI("prohibido", "tarea de otro operador", status=403)
    return tarea


@router.get("/tareas/{tarea_id}", response_model=TareaOut)
async def detalle_tarea(
    tarea_id: uuid.UUID, session: SessionDep, actor: CrmUser
) -> TareaOut:
    tarea = await _get_tarea(session, tarea_id, actor)
    return TareaOut.model_validate(tarea)


@router.patch("/tareas/{tarea_id}", response_model=TareaOut)
async def actualizar_tarea(
    tarea_id: uuid.UUID, datos: TareaPatch, session: SessionDep, actor: CrmUser
) -> TareaOut:
    tarea = await _get_tarea(session, tarea_id, actor)
    tarea = await servicio.actualizar_tarea(
        session, tarea=tarea, estado=datos.estado, operador_id=datos.operador_id,
        prioridad=datos.prioridad, vencimiento=datos.vencimiento, actor_id=actor.id,
    )
    return TareaOut.model_validate(tarea)


@router.post("/tareas/{tarea_id}/completar", response_model=InteraccionOut)
async def completar_tarea(
    tarea_id: uuid.UUID, datos: CompletarTareaIn, session: SessionDep, actor: CrmUser
) -> InteraccionOut:
    tarea = await _get_tarea(session, tarea_id, actor)
    _tarea, interaccion = await servicio.completar_tarea(
        session, tarea=tarea, tipo=datos.tipo, detalle=datos.detalle, actor_id=actor.id
    )
    return InteraccionOut.model_validate(interaccion)


# ---------- Interacciones ----------
@router.post("/interacciones", response_model=InteraccionOut, status_code=201)
async def crear_interaccion(
    datos: InteraccionIn, session: SessionDep, actor: CrmUser
) -> InteraccionOut:
    interaccion = await servicio.crear_interaccion(
        session, persona_id=datos.persona_id, tipo=datos.tipo, detalle=datos.detalle,
        tarea_id=datos.tarea_id, operador_id=actor.id, actor_id=actor.id,
    )
    return InteraccionOut.model_validate(interaccion)


@router.get("/personas/{persona_id}/tareas", response_model=list[TareaOut])
async def tareas_de_persona(
    persona_id: uuid.UUID, session: SessionDep, actor: CrmUser
) -> list[TareaOut]:
    operador = None if _es_admin(actor) else actor.id
    tareas = await servicio.listar_tareas(
        session, operador_id=operador, persona_id=persona_id
    )
    return [TareaOut.model_validate(t) for t in tareas]


@router.get("/personas/{persona_id}/timeline", response_model=list[TimelineEvento])
async def timeline_persona(
    persona_id: uuid.UUID, session: SessionDep, _: CrmUser
) -> list[TimelineEvento]:
    return await servicio.timeline(session, persona_id)


# ---------- Incidentes ----------
@router.get("/incidentes", response_model=list[IncidenteOut])
async def listar_incidentes(
    session: SessionDep,
    _: CrmUser,
    estado: Annotated[str | None, Query()] = None,
    persona_id: Annotated[uuid.UUID | None, Query()] = None,
) -> list[IncidenteOut]:
    incs = await servicio.listar_incidentes(
        session, estado=estado, persona_id=persona_id
    )
    return [IncidenteOut.model_validate(i) for i in incs]


@router.post("/incidentes", response_model=IncidenteOut, status_code=201)
async def crear_incidente(
    datos: IncidenteIn, session: SessionDep, actor: CrmUser
) -> IncidenteOut:
    inc = await servicio.crear_incidente(
        session, persona_id=datos.persona_id, tipo=datos.tipo, titulo=datos.titulo,
        severidad=datos.severidad, detalle=datos.detalle,
        operador_id=datos.operador_id or actor.id, actor_id=actor.id,
    )
    return IncidenteOut.model_validate(inc)


async def _get_incidente(session, incidente_id: uuid.UUID):
    inc = await servicio.obtener_incidente(session, incidente_id)
    if inc is None:
        raise ErrorAPI("incidente_no_encontrado", "incidente inexistente", status=404)
    return inc


@router.get("/incidentes/{incidente_id}", response_model=IncidenteOut)
async def detalle_incidente(
    incidente_id: uuid.UUID, session: SessionDep, _: CrmUser
) -> IncidenteOut:
    inc = await _get_incidente(session, incidente_id)
    return IncidenteOut.model_validate(inc)


@router.patch("/incidentes/{incidente_id}", response_model=IncidenteOut)
async def actualizar_incidente(
    incidente_id: uuid.UUID, datos: IncidentePatch, session: SessionDep, actor: CrmUser
) -> IncidenteOut:
    inc = await _get_incidente(session, incidente_id)
    inc = await servicio.actualizar_incidente(
        session, incidente=inc, estado=datos.estado, severidad=datos.severidad,
        operador_id=datos.operador_id, actor_id=actor.id,
    )
    return IncidenteOut.model_validate(inc)


# ---------- Asignaciones ----------
@router.post("/crm/asignaciones", response_model=AsignacionOut, status_code=201)
async def crear_asignacion(
    datos: AsignacionIn, session: SessionDep, actor: AdminUser
) -> AsignacionOut:
    asignacion = await servicio.asignar(
        session, persona_id=datos.persona_id, operador_id=datos.operador_id,
        actor_id=actor.id,
    )
    return AsignacionOut.model_validate(asignacion)


@router.post("/crm/asignaciones/masivo", response_model=list[AsignacionOut])
async def crear_asignacion_masiva(
    datos: AsignacionMasivaIn, session: SessionDep, actor: AdminUser
) -> list[AsignacionOut]:
    asignaciones = await servicio.asignar_masivo(
        session, persona_ids=datos.persona_ids, operador_id=datos.operador_id,
        actor_id=actor.id,
    )
    return [AsignacionOut.model_validate(a) for a in asignaciones]


# ---------- Prospectos ----------
@router.get("/prospectos", response_model=list[ProspectoOut])
async def listar_prospectos(
    session: SessionDep,
    _: CrmUser,
    estado: Annotated[str | None, Query()] = None,
) -> list[ProspectoOut]:
    prospectos = await servicio.listar_prospectos(session, estado=estado)
    return [ProspectoOut.model_validate(p) for p in prospectos]


@router.post("/prospectos", response_model=ProspectoOut, status_code=201)
async def crear_prospecto(
    datos: ProspectoIn, session: SessionDep, actor: CrmUser
) -> ProspectoOut:
    prospecto = await servicio.crear_prospecto(
        session, nombre=datos.nombre, telefono=datos.telefono,
        operador_id=datos.operador_id or actor.id, actor_id=actor.id,
    )
    return ProspectoOut.model_validate(prospecto)


@router.patch("/prospectos/{prospecto_id}", response_model=ProspectoOut)
async def actualizar_prospecto(
    prospecto_id: uuid.UUID, datos: ProspectoPatch, session: SessionDep, actor: CrmUser
) -> ProspectoOut:
    prospecto = await servicio.obtener_prospecto(session, prospecto_id)
    if prospecto is None:
        raise ErrorAPI("prospecto_no_encontrado", "prospecto inexistente", status=404)
    prospecto = await servicio.actualizar_prospecto(
        session, prospecto=prospecto, estado=datos.estado, nombre=datos.nombre,
        telefono=datos.telefono, persona_id=datos.persona_id, actor_id=actor.id,
    )
    return ProspectoOut.model_validate(prospecto)
