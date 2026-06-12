import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.deps import SessionDep, requiere_rol
from app.errors import ErrorAPI
from app.m12_auth.modelos import Usuario
from app.workflows import motor, servicio
from app.workflows.schemas import (
    ContextoIn,
    EfectoOut,
    EjecucionOut,
    ProcesarOut,
    ReglaIn,
    ReglaOut,
    ReglaPatch,
)

router = APIRouter(tags=["workflows"])

AdminUser = Annotated[Usuario, Depends(requiere_rol("admin"))]
WorkflowUser = Annotated[Usuario, Depends(requiere_rol("admin", "operador"))]


@router.get("/workflow-reglas", response_model=list[ReglaOut])
async def listar_reglas(session: SessionDep, _: WorkflowUser) -> list[ReglaOut]:
    reglas = await servicio.listar_reglas(session)
    return [ReglaOut.model_validate(r) for r in reglas]


@router.post("/workflow-reglas", response_model=ReglaOut, status_code=201)
async def crear_regla(
    datos: ReglaIn, session: SessionDep, actor: AdminUser
) -> ReglaOut:
    regla = await servicio.crear_regla(session, datos, actor_id=actor.id)
    return ReglaOut.model_validate(regla)


@router.patch("/workflow-reglas/{regla_id}", response_model=ReglaOut)
async def patch_regla(
    regla_id: uuid.UUID, datos: ReglaPatch, session: SessionDep, actor: AdminUser
) -> ReglaOut:
    regla = await servicio.obtener_regla(session, regla_id)
    if regla is None:
        raise ErrorAPI("regla_no_encontrada", "regla inexistente", status=404)
    regla = await servicio.actualizar_regla(session, regla, datos, actor_id=actor.id)
    return ReglaOut.model_validate(regla)


@router.post("/workflows/procesar", response_model=ProcesarOut)
async def procesar(
    contexto: ContextoIn, session: SessionDep, actor: AdminUser
) -> ProcesarOut:
    efectos = await motor.evaluar(session, contexto, actor_id=actor.id)
    await session.commit()
    salida = [
        EfectoOut(regla_id=e.regla_id, accion=e.accion, resultado=e.resultado,
                  detalle=e.detalle, entidad_id=e.entidad_id)
        for e in efectos
    ]
    disparados = sum(1 for e in efectos if e.resultado == "ok")
    omitidos = sum(1 for e in efectos if e.resultado == "omitido")
    return ProcesarOut(disparados=disparados, omitidos=omitidos, efectos=salida)


@router.get("/workflows/ejecuciones", response_model=list[EjecucionOut])
async def listar_ejecuciones(
    session: SessionDep,
    _: WorkflowUser,
    regla_id: Annotated[uuid.UUID | None, Query()] = None,
) -> list[EjecucionOut]:
    ejecs = await servicio.listar_ejecuciones(session, regla_id)
    return [EjecucionOut.model_validate(e) for e in ejecs]
