import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auditoria import escribir_evento
from app.errors import ErrorAPI
from app.modelos_stub import WorkflowEjecucion, WorkflowRegla
from app.workflows.schemas import ACCIONES, FAMILIAS


async def crear_regla(session: AsyncSession, datos, *, actor_id) -> WorkflowRegla:
    if datos.familia not in FAMILIAS:
        raise ErrorAPI("familia_invalida", f"familia invalida: {datos.familia}", status=422)
    if datos.accion not in ACCIONES:
        raise ErrorAPI("accion_invalida", f"accion invalida: {datos.accion}", status=422)
    regla = WorkflowRegla(
        nombre=datos.nombre, familia=datos.familia, disparador=datos.disparador,
        accion=datos.accion, condicion_json=datos.condicion_json,
        accion_params=datos.accion_params, activo=datos.activo, orden=datos.orden,
    )
    session.add(regla)
    await session.flush()
    await escribir_evento(
        session, actor_id=actor_id, accion="workflow_regla_alta",
        entidad="workflow_regla", entidad_id=regla.id,
    )
    await session.commit()
    await session.refresh(regla)
    return regla


async def listar_reglas(session: AsyncSession) -> list[WorkflowRegla]:
    res = await session.execute(
        select(WorkflowRegla).order_by(WorkflowRegla.orden, WorkflowRegla.created_at)
    )
    return list(res.scalars().all())


async def obtener_regla(
    session: AsyncSession, regla_id: uuid.UUID
) -> WorkflowRegla | None:
    res = await session.execute(
        select(WorkflowRegla).where(WorkflowRegla.id == regla_id)
    )
    return res.scalar_one_or_none()


async def actualizar_regla(
    session: AsyncSession, regla: WorkflowRegla, datos, *, actor_id
) -> WorkflowRegla:
    for campo in ("nombre", "activo", "orden", "accion_params", "condicion_json"):
        valor = getattr(datos, campo)
        if valor is not None:
            setattr(regla, campo, valor)
    await session.flush()
    await escribir_evento(
        session, actor_id=actor_id, accion="workflow_regla_modificada",
        entidad="workflow_regla", entidad_id=regla.id,
    )
    await session.commit()
    await session.refresh(regla)
    return regla


async def listar_ejecuciones(
    session: AsyncSession, regla_id: uuid.UUID | None = None
) -> list[WorkflowEjecucion]:
    stmt = select(WorkflowEjecucion).order_by(WorkflowEjecucion.ejecutado_en.desc())
    if regla_id is not None:
        stmt = stmt.where(WorkflowEjecucion.regla_id == regla_id)
    res = await session.execute(stmt)
    return list(res.scalars().all())
