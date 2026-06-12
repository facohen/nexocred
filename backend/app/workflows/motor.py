"""Motor de workflows §7.2: evalua reglas contra un contexto de disparo y produce
SOLO efectos internos (tarea / incidente / notificacion interna / escalar a admin).

NO hay canal externo (WhatsApp/SMS/email): las notificaciones son registros internos
(tareas CRM + alertas en La Torre). Idempotente por (regla_id, dedupe_key): el mismo
contexto no vuelve a disparar la misma regla (UNIQUE(regla_id, dedupe_key)).
"""

import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auditoria import escribir_evento
from app.m08_crm.servicio import crear_tarea
from app.modelos_stub import Alerta, Incidente, WorkflowEjecucion, WorkflowRegla


@dataclass
class Efecto:
    regla_id: uuid.UUID
    accion: str
    resultado: str
    detalle: str | None = None
    entidad_id: str | None = None


def _dedupe_key(disparador: str, contexto) -> str:
    ancla = contexto.prestamo_id or contexto.persona_id or "global"
    return f"{disparador}:{ancla}"


def _condicion_satisfecha(regla: WorkflowRegla, contexto) -> bool:
    """condicion_json es un AND de igualdades sobre contexto.datos (POC)."""
    cond = regla.condicion_json or {}
    if not cond:
        return True
    datos = contexto.datos or {}
    return all(datos.get(k) == v for k, v in cond.items())


async def _reglas_activas(
    session: AsyncSession, disparador: str, familia: str | None
) -> list[WorkflowRegla]:
    stmt = select(WorkflowRegla).where(
        WorkflowRegla.activo.is_(True),
        WorkflowRegla.disparador == disparador,
    )
    if familia is not None:
        stmt = stmt.where(WorkflowRegla.familia == familia)
    stmt = stmt.order_by(WorkflowRegla.orden, WorkflowRegla.created_at)
    res = await session.execute(stmt)
    return list(res.scalars().all())


async def _reservar_ejecucion(
    session: AsyncSession, regla: WorkflowRegla, contexto, dedupe_key: str
) -> WorkflowEjecucion | None:
    """Inserta la fila de ejecucion (idempotente). Devuelve None si ya existia."""
    existente = await session.execute(
        select(WorkflowEjecucion).where(
            WorkflowEjecucion.regla_id == regla.id,
            WorkflowEjecucion.dedupe_key == dedupe_key,
        )
    )
    if existente.scalar_one_or_none() is not None:
        return None
    ejec = WorkflowEjecucion(
        regla_id=regla.id, prestamo_id=contexto.prestamo_id,
        persona_id=contexto.persona_id, resultado="ok", dedupe_key=dedupe_key,
    )
    try:
        async with session.begin_nested():
            session.add(ejec)
            await session.flush()
    except IntegrityError:
        return None
    return ejec


async def _aplicar_accion(
    session: AsyncSession, regla: WorkflowRegla, contexto, *, actor_id
) -> tuple[str, str | None]:
    """Ejecuta el efecto interno. Devuelve (detalle, entidad_id)."""
    params = regla.accion_params or {}
    titulo = params.get("titulo", regla.nombre)
    if regla.accion == "crear_tarea":
        tarea = await crear_tarea(
            session, persona_id=contexto.persona_id, operador_id=None,
            titulo=titulo, descripcion=params.get("descripcion"),
            prioridad=params.get("prioridad", "media"), origen="workflow",
            actor_id=actor_id, commit=False,
        )
        return "tarea creada", str(tarea.id)
    if regla.accion == "crear_incidente":
        inc = Incidente(
            persona_id=contexto.persona_id, tipo=params.get("tipo", "workflow"),
            titulo=titulo, severidad=params.get("severidad", "media"),
            detalle=params.get("descripcion"), operador_id=None, estado="abierto",
        )
        session.add(inc)
        await session.flush()
        return "incidente creado", str(inc.id)
    if regla.accion == "enviar_notificacion_interna":
        # notificacion interna = alerta en La Torre (sin canal externo)
        alerta = Alerta(
            prestamo_id=contexto.prestamo_id, persona_id=contexto.persona_id,
            tipo=params.get("tipo", "notificacion"), estado="activa",
            severidad=params.get("severidad", "baja"),
            metrica=params.get("metrica", "workflow"),
        )
        session.add(alerta)
        await session.flush()
        return "notificacion interna creada", str(alerta.id)
    if regla.accion == "escalar_admin":
        inc = Incidente(
            persona_id=contexto.persona_id, tipo="escalamiento",
            titulo=titulo, severidad="alta",
            detalle=params.get("descripcion", "escalado a admin por workflow"),
            operador_id=None, estado="abierto",
        )
        session.add(inc)
        await session.flush()
        return "escalado a admin", str(inc.id)
    raise ValueError(f"accion desconocida: {regla.accion}")


async def evaluar(
    session: AsyncSession, contexto, *, actor_id: uuid.UUID | None
) -> list[Efecto]:
    reglas = await _reglas_activas(session, contexto.disparador, contexto.familia)
    efectos: list[Efecto] = []
    for regla in reglas:
        if not _condicion_satisfecha(regla, contexto):
            efectos.append(Efecto(regla.id, regla.accion, "omitido", "condicion no cumplida"))
            continue
        dedupe_key = _dedupe_key(contexto.disparador, contexto)
        ejec = await _reservar_ejecucion(session, regla, contexto, dedupe_key)
        if ejec is None:
            efectos.append(Efecto(regla.id, regla.accion, "omitido", "ya ejecutado"))
            continue
        detalle, entidad_id = await _aplicar_accion(
            session, regla, contexto, actor_id=actor_id
        )
        ejec.detalle = detalle
        await session.flush()
        await escribir_evento(
            session, actor_id=actor_id, accion="workflow_ejecutado",
            entidad="workflow_ejecucion", entidad_id=ejec.id,
            metadata_json={"regla": str(regla.id), "accion": regla.accion,
                           "dedupe_key": dedupe_key},
        )
        efectos.append(Efecto(regla.id, regla.accion, "ok", detalle, entidad_id))
    return efectos
