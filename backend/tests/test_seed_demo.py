"""Task 4: la siembra demo es determinista, idempotente y produce Torre significativa."""

import pytest
from sqlalchemy import func, select

from app.jobs.snapshot import generar_snapshot
from app.m01_personas.modelos import Persona
from app.m11_torre import servicio as torre
from app.modelos_stub import Pago, Prestamo, SnapshotCartera
from scripts.seed_demo import FECHA_DEMO, sembrar_demo

pytestmark = pytest.mark.asyncio


async def _contar(session, modelo) -> int:
    return await session.scalar(select(func.count()).select_from(modelo))


async def test_seed_crea_portafolio_realista(session):
    res = await sembrar_demo(session)
    assert res["personas"] >= 18
    assert res["prestamos"] >= 1
    assert res["pagos"] >= 1

    personas = await _contar(session, Persona)
    prestamos = await _contar(session, Prestamo)
    pagos = await _contar(session, Pago)
    assert personas >= 18
    assert prestamos >= 1
    assert pagos >= 1


async def test_seed_idempotente_no_duplica(session):
    await sembrar_demo(session)
    p1 = await _contar(session, Persona)
    pr1 = await _contar(session, Prestamo)
    pa1 = await _contar(session, Pago)

    await sembrar_demo(session)
    p2 = await _contar(session, Persona)
    pr2 = await _contar(session, Prestamo)
    pa2 = await _contar(session, Pago)

    assert (p1, pr1, pa1) == (p2, pr2, pa2), "re-correr la siembra no debe duplicar"


async def test_seed_produce_mora_para_torre(session):
    """Debe haber prestamos en mora para que La Torre tenga senial de riesgo."""
    await sembrar_demo(session)
    await generar_snapshot(session, FECHA_DEMO, actor_id=None)
    await session.commit()

    snap = await session.scalar(
        select(SnapshotCartera).order_by(SnapshotCartera.fecha_corte.desc())
    )
    assert snap is not None
    assert snap.prestamos_vigentes > 0
    assert snap.prestamos_en_mora > 0


async def test_torre_pulso_no_vacio(session):
    await sembrar_demo(session)
    await generar_snapshot(session, FECHA_DEMO, actor_id=None)
    await session.commit()

    resumen = await torre.resumen(session)
    assert resumen["tiene_snapshot"] is True
    assert resumen["prestamos_vigentes"] > 0

    pulso = await torre.pulso(session)
    assert pulso["tiene_snapshot"] is True
    tarjetas = {t["clave"]: t["valor"] for t in pulso["tarjetas"]}
    # KPIs no-cero: cartera viva, no un estado vacio.
    assert int(tarjetas["prestamos_vigentes"]) > 0
