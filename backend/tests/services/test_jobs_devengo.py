"""Tests de devengar_punitorios y recalcular_aging: idempotentes por fecha_corte."""

from datetime import date, timedelta
from decimal import Decimal

import pytest

from app.jobs.aging import recalcular_aging
from app.jobs.punitorios import devengar_punitorios
from app.modelos_stub import Cuota
from tests._seed_f1d import crear_persona, crear_prestamo, crear_producto

pytestmark = pytest.mark.asyncio


async def _seed_mora(session, fecha_corte: date, dias_atraso: int):
    persona = await crear_persona(session)
    producto = await crear_producto(session)
    prestamo = await crear_prestamo(
        session, persona.id, producto.id, capital=Decimal("100000"),
        fecha_desembolso=fecha_corte - timedelta(days=dias_atraso + 30),
        tasa_punitorio_diario=Decimal("0.001"),
    )
    cuota = Cuota(
        prestamo_id=prestamo.id, numero=1,
        vencimiento=fecha_corte - timedelta(days=dias_atraso),
        capital=Decimal("100000"), interes=Decimal("10000"), cuota=Decimal("110000"),
        estado="pendiente", punitorio_acumulado=Decimal("0"),
    )
    session.add(cuota)
    await session.flush()
    return prestamo, cuota


async def test_devenga_punitorio_en_cuota_vencida(session):
    fecha = date(2026, 6, 11)
    prestamo, cuota = await _seed_mora(session, fecha, dias_atraso=10)
    await devengar_punitorios(session, fecha, actor_id=None)
    await session.flush()

    refreshed = await session.get(Cuota, cuota.id)
    assert refreshed is not None
    assert refreshed.punitorio_acumulado > Decimal("0")


async def test_devengo_idempotente_valor_absoluto(session):
    fecha = date(2026, 6, 11)
    prestamo, cuota = await _seed_mora(session, fecha, dias_atraso=10)

    await devengar_punitorios(session, fecha, actor_id=None)
    await session.flush()
    primero = (await session.get(Cuota, cuota.id)).punitorio_acumulado

    await devengar_punitorios(session, fecha, actor_id=None)
    await session.flush()
    segundo = (await session.get(Cuota, cuota.id)).punitorio_acumulado

    assert primero == segundo  # absoluto, no incremental


async def test_cuota_al_dia_sin_punitorio(session):
    fecha = date(2026, 6, 11)
    persona = await crear_persona(session)
    producto = await crear_producto(session)
    prestamo = await crear_prestamo(
        session, persona.id, producto.id, capital=Decimal("100000"),
        fecha_desembolso=fecha - timedelta(days=5),
    )
    cuota = Cuota(
        prestamo_id=prestamo.id, numero=1, vencimiento=fecha + timedelta(days=30),
        capital=Decimal("100000"), interes=Decimal("10000"), cuota=Decimal("110000"),
        estado="pendiente", punitorio_acumulado=Decimal("0"),
    )
    session.add(cuota)
    await session.flush()

    await devengar_punitorios(session, fecha, actor_id=None)
    await session.flush()
    assert (await session.get(Cuota, cuota.id)).punitorio_acumulado == Decimal("0.00")


async def test_recalcular_aging_buckets(session):
    fecha = date(2026, 6, 11)
    await _seed_mora(session, fecha, dias_atraso=45)  # bucket 31_60
    await _seed_mora(session, fecha, dias_atraso=5)   # bucket 1_30
    res = await recalcular_aging(session, fecha, actor_id=None)
    assert res["31_60"] == Decimal("100000")
    assert res["1_30"] == Decimal("100000")
    assert res["al_dia"] == Decimal("0")


async def test_aging_idempotente(session):
    fecha = date(2026, 6, 11)
    await _seed_mora(session, fecha, dias_atraso=45)
    r1 = await recalcular_aging(session, fecha, actor_id=None)
    r2 = await recalcular_aging(session, fecha, actor_id=None)
    assert r1 == r2
