"""Tests del motor de workflows: matching, efectos internos, idempotencia."""

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import func, select

from app.modelos_stub import Incidente, Tarea, WorkflowEjecucion, WorkflowRegla
from app.workflows import motor
from app.workflows.schemas import ContextoIn
from tests._seed_f1d import crear_persona, crear_prestamo, crear_producto

pytestmark = pytest.mark.asyncio


async def _persona_prestamo(session):
    persona = await crear_persona(session)
    producto = await crear_producto(session)
    prestamo = await crear_prestamo(
        session, persona.id, producto.id, capital=Decimal("100000"),
        fecha_desembolso=date(2026, 6, 1),
    )
    return persona, prestamo


def _regla(**kw) -> WorkflowRegla:
    base = dict(
        nombre="R1", familia="cobranza", disparador="mora_dia_3",
        accion="crear_tarea", activo=True, orden=0,
    )
    base.update(kw)
    return WorkflowRegla(**base)


async def test_disparo_crea_una_tarea_y_una_ejecucion(session):
    persona, prestamo = await _persona_prestamo(session)
    session.add(_regla())
    await session.flush()

    ctx = ContextoIn(disparador="mora_dia_3", prestamo_id=prestamo.id,
                     persona_id=persona.id)
    efectos = await motor.evaluar(session, ctx, actor_id=None)
    await session.flush()

    assert len(efectos) == 1
    assert efectos[0].resultado == "ok"
    assert efectos[0].accion == "crear_tarea"

    tareas = await session.scalar(select(func.count()).select_from(Tarea))
    ejecs = await session.scalar(select(func.count()).select_from(WorkflowEjecucion))
    assert tareas == 1
    assert ejecs == 1


async def test_idempotente_mismo_contexto(session):
    persona, prestamo = await _persona_prestamo(session)
    session.add(_regla())
    await session.flush()
    ctx = ContextoIn(disparador="mora_dia_3", prestamo_id=prestamo.id,
                     persona_id=persona.id)

    await motor.evaluar(session, ctx, actor_id=None)
    await session.flush()
    efectos2 = await motor.evaluar(session, ctx, actor_id=None)
    await session.flush()

    assert efectos2[0].resultado == "omitido"
    tareas = await session.scalar(select(func.count()).select_from(Tarea))
    ejecs = await session.scalar(select(func.count()).select_from(WorkflowEjecucion))
    assert tareas == 1  # no se duplica
    assert ejecs == 1


async def test_no_dispara_si_disparador_no_matchea(session):
    persona, prestamo = await _persona_prestamo(session)
    session.add(_regla(disparador="mora_dia_7"))
    await session.flush()
    ctx = ContextoIn(disparador="mora_dia_3", prestamo_id=prestamo.id,
                     persona_id=persona.id)
    efectos = await motor.evaluar(session, ctx, actor_id=None)
    assert efectos == []


async def test_condicion_json_filtra(session):
    persona, prestamo = await _persona_prestamo(session)
    session.add(_regla(condicion_json={"zona": "norte"}))
    await session.flush()
    # contexto sin la zona requerida -> omitido
    ctx = ContextoIn(disparador="mora_dia_3", prestamo_id=prestamo.id,
                     persona_id=persona.id, datos={"zona": "sur"})
    efectos = await motor.evaluar(session, ctx, actor_id=None)
    assert efectos[0].resultado == "omitido"


async def test_escalar_admin_crea_incidente_interno(session):
    persona, prestamo = await _persona_prestamo(session)
    session.add(_regla(accion="escalar_admin", disparador="mora_dia_30"))
    await session.flush()
    ctx = ContextoIn(disparador="mora_dia_30", prestamo_id=prestamo.id,
                     persona_id=persona.id)
    efectos = await motor.evaluar(session, ctx, actor_id=None)
    await session.flush()
    assert efectos[0].resultado == "ok"
    incs = await session.scalar(select(func.count()).select_from(Incidente))
    assert incs == 1


async def test_notificacion_interna_no_es_externa(session):
    """La notificacion interna crea una alerta en La Torre, nunca un envio externo."""
    persona, prestamo = await _persona_prestamo(session)
    session.add(_regla(accion="enviar_notificacion_interna"))
    await session.flush()
    ctx = ContextoIn(disparador="mora_dia_3", prestamo_id=prestamo.id,
                     persona_id=persona.id)
    efectos = await motor.evaluar(session, ctx, actor_id=None)
    await session.flush()
    assert efectos[0].resultado == "ok"
    assert "notificacion interna" in efectos[0].detalle
