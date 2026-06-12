"""Task 2: generar_rutas_job y barrer_workflows_job, testeados directamente."""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import func, select

from app.jobs.rutas import generar_rutas_job
from app.jobs.workflows_job import barrer_workflows_job
from app.m12_auth.servicio import crear_usuario
from app.modelos_stub import Cuota, ParadaRuta, RutaDiaria, Tarea, WorkflowRegla
from tests._seed_f1d import crear_persona, crear_prestamo, crear_producto

pytestmark = pytest.mark.asyncio


async def _roles(session):
    from app.m12_auth.modelos import Rol

    for nombre in ("admin", "cobrador"):
        existe = await session.scalar(select(Rol).where(Rol.nombre == nombre))
        if existe is None:
            session.add(Rol(nombre=nombre))
    await session.flush()


async def _prestamo_en_mora(session, fecha: date, dias_atraso: int):
    persona = await crear_persona(session)
    producto = await crear_producto(session)
    prestamo = await crear_prestamo(
        session, persona.id, producto.id, capital=Decimal("100000"),
        fecha_desembolso=fecha - timedelta(days=dias_atraso + 30),
    )
    session.add(
        Cuota(
            prestamo_id=prestamo.id, numero=1,
            vencimiento=fecha - timedelta(days=dias_atraso),
            capital=Decimal("100000"), interes=Decimal("10000"),
            cuota=Decimal("110000"), estado="pendiente",
            punitorio_acumulado=Decimal("0"),
        )
    )
    await session.flush()
    return persona, prestamo


async def test_generar_rutas_crea_ruta_con_paradas_por_cobrador(session):
    await _roles(session)
    fecha = date(2026, 6, 11)
    cob = await crear_usuario(
        session, email="cob@nexo.test", nombre="Cob", password="secreto123",
        roles=["cobrador"], actor_id=None,
    )
    await _prestamo_en_mora(session, fecha, dias_atraso=10)

    creadas = await generar_rutas_job(session, fecha, actor_id=None)
    assert creadas >= 1  # al menos la de este cobrador

    rutas = list((await session.execute(
        select(RutaDiaria).where(RutaDiaria.cobrador_id == cob.id)
    )).scalars())
    assert len(rutas) == 1
    paradas = await session.scalar(
        select(func.count()).select_from(ParadaRuta).where(
            ParadaRuta.ruta_id == rutas[0].id
        )
    )
    assert paradas == 1  # el prestamo con saldo exigible > 0


async def test_generar_rutas_idempotente_no_duplica(session):
    await _roles(session)
    fecha = date(2026, 6, 11)
    cob = await crear_usuario(
        session, email="cob2@nexo.test", nombre="Cob", password="secreto123",
        roles=["cobrador"], actor_id=None,
    )
    await _prestamo_en_mora(session, fecha, dias_atraso=10)

    await generar_rutas_job(session, fecha, actor_id=None)
    await generar_rutas_job(session, fecha, actor_id=None)

    # Idempotente para ESTE cobrador en ESTA fecha (los datos de otros tests que
    # comparten DB no nos afectan: filtramos por cobrador).
    total_cob = await session.scalar(
        select(func.count()).select_from(RutaDiaria).where(
            RutaDiaria.cobrador_id == cob.id, RutaDiaria.fecha == fecha
        )
    )
    assert total_cob == 1


async def test_barrer_workflows_dispara_regla_de_mora(session):
    fecha = date(2026, 6, 11)
    _, prestamo = await _prestamo_en_mora(session, fecha, dias_atraso=3)
    session.add(
        WorkflowRegla(
            nombre="R", familia="cobranza", disparador="mora_dia_3",
            accion="crear_tarea", activo=True, orden=0,
        )
    )
    await session.flush()

    efectos = await barrer_workflows_job(session, fecha, actor_id=None)
    await session.flush()

    oks = [e for e in efectos if e.resultado == "ok"]
    assert len(oks) == 1
    tareas = await session.scalar(select(func.count()).select_from(Tarea))
    assert tareas == 1


async def test_barrer_workflows_idempotente(session):
    fecha = date(2026, 6, 11)
    await _prestamo_en_mora(session, fecha, dias_atraso=3)
    session.add(
        WorkflowRegla(
            nombre="R", familia="cobranza", disparador="mora_dia_3",
            accion="crear_tarea", activo=True, orden=0,
        )
    )
    await session.flush()

    await barrer_workflows_job(session, fecha, actor_id=None)
    await session.flush()
    efectos2 = await barrer_workflows_job(session, fecha, actor_id=None)
    await session.flush()

    assert all(e.resultado == "omitido" for e in efectos2)
    tareas = await session.scalar(select(func.count()).select_from(Tarea))
    assert tareas == 1  # no duplica
