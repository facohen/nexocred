"""Motor de alarmas de riesgo.

Escanea la cartera y crea filas `alerta` por umbrales de mora superados, de forma
IDEMPOTENTE: no se crea una segunda alerta activa para el mismo (prestamo, metrica).
Asignar una alerta CREA una `tarea` CRM interna (sin WhatsApp, spec §M07/§5.8) y
vincula `alerta.operador_id` y `alerta.tarea_id`.
"""

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auditoria import escribir_evento
from app.errors import ErrorAPI
from app.m07_riesgo.servicio import cartera_riesgo
from app.m08_crm import servicio as crm
from app.modelos_stub import Alerta

# Umbrales de mora (dias) -> (metrica, severidad).
UMBRALES = [
    (90, "mora_90", "critica"),
    (60, "mora_60", "alta"),
    (30, "mora_30", "media"),
]


async def _alerta_activa(
    session: AsyncSession, prestamo_id: uuid.UUID, metrica: str
) -> Alerta | None:
    res = await session.execute(
        select(Alerta).where(
            Alerta.prestamo_id == prestamo_id,
            Alerta.metrica == metrica,
            Alerta.estado == "activa",
        )
    )
    return res.scalar_one_or_none()


def _metrica_para(dias: int) -> tuple[str, str] | None:
    for umbral, metrica, severidad in UMBRALES:
        if dias >= umbral:
            return metrica, severidad
    return None


async def procesar(
    session: AsyncSession, *, fecha: date | None = None, actor_id: uuid.UUID | None
) -> tuple[int, int]:
    """Corre el motor: por cada prestamo en mora crea (si no existe) una alerta activa
    para la metrica del tramo de mora mas severo. Devuelve (creadas, existentes)."""
    snaps = await cartera_riesgo(session, fecha)
    creadas = 0
    existentes = 0
    for snap in snaps:
        res = _metrica_para(snap.dias_atraso)
        if res is None:
            continue
        metrica, severidad = res
        prestamo_id = uuid.UUID(snap.prestamo_id)
        if await _alerta_activa(session, prestamo_id, metrica) is not None:
            existentes += 1
            continue
        alerta = Alerta(
            prestamo_id=prestamo_id,
            persona_id=uuid.UUID(snap.cliente_id) if snap.cliente_id else None,
            tipo="mora",
            estado="activa",
            severidad=severidad,
            metrica=metrica,
            valor=Decimal(snap.dias_atraso),
        )
        session.add(alerta)
        creadas += 1
    await session.flush()
    await escribir_evento(
        session, actor_id=actor_id, accion="alarmas_procesar", entidad="alerta",
        metadata_json={"creadas": creadas, "existentes": existentes},
    )
    await session.commit()
    return creadas, existentes


async def obtener_alerta(
    session: AsyncSession, alerta_id: uuid.UUID
) -> Alerta | None:
    res = await session.execute(select(Alerta).where(Alerta.id == alerta_id))
    return res.scalar_one_or_none()


def query_alertas(
    *,
    estado: str | None = None,
    severidad: str | None = None,
):
    """Devuelve un Select sin ejecutar, listo para paginar_query."""
    stmt = select(Alerta).order_by(Alerta.created_at.desc())
    if estado is not None:
        stmt = stmt.where(Alerta.estado == estado)
    if severidad is not None:
        stmt = stmt.where(Alerta.severidad == severidad)
    return stmt


async def resolver(
    session: AsyncSession,
    *,
    alerta: Alerta,
    justificacion: str,
    actor_id: uuid.UUID | None,
) -> Alerta:
    if alerta.estado != "activa":
        raise ErrorAPI(
            "transicion_invalida", "solo se resuelve una alerta activa", status=409
        )
    alerta.estado = "resuelta"
    alerta.justificacion = justificacion
    alerta.resuelta_en = datetime.now(UTC)
    await session.flush()
    await escribir_evento(
        session, actor_id=actor_id, accion="alerta_resolver", entidad="alerta",
        entidad_id=alerta.id, metadata_json={"justificacion": justificacion},
    )
    await session.commit()
    return alerta


async def asignar(
    session: AsyncSession,
    *,
    alerta: Alerta,
    operador_id: uuid.UUID,
    actor_id: uuid.UUID | None,
) -> Alerta:
    """Asigna la alerta a un operador. Si la alerta ya tiene una tarea CRM vinculada,
    ACTUALIZA esa tarea (sin crear otra) — reasignar es idempotente. Si no, crea una."""
    tarea = None
    if alerta.tarea_id is not None:
        tarea = await crm.obtener_tarea(session, alerta.tarea_id)
    if tarea is not None:
        await crm.actualizar_tarea(
            session,
            tarea=tarea,
            estado=None,
            operador_id=operador_id,
            prioridad=None,
            vencimiento=None,
            actor_id=actor_id,
        )
    else:
        tarea = await crm.crear_tarea(
            session,
            persona_id=alerta.persona_id,
            operador_id=operador_id,
            titulo=f"Gestionar alerta {alerta.metrica or alerta.tipo}",
            descripcion=f"Alerta de riesgo {alerta.severidad} sobre prestamo "
            f"{alerta.prestamo_id}",
            prioridad=alerta.severidad,
            origen="alerta",
            alerta_id=alerta.id,
            actor_id=actor_id,
            commit=False,
        )
    alerta.operador_id = operador_id
    alerta.tarea_id = tarea.id
    await session.flush()
    await escribir_evento(
        session, actor_id=actor_id, accion="alerta_asignar", entidad="alerta",
        entidad_id=alerta.id,
        metadata_json={"operador_id": str(operador_id), "tarea_id": str(tarea.id)},
    )
    await session.commit()
    return alerta
