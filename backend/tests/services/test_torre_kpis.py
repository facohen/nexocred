"""Tests de servicio La Torre: indice Nexo, estado vacio, derivacion del snapshot."""

from datetime import date
from decimal import Decimal

import pytest

from app.m11_torre import servicio
from app.modelos_stub import SnapshotCartera

pytestmark = pytest.mark.asyncio


def _snap(**kw):
    base = dict(
        fecha_corte=date(2026, 6, 11), prestamos_vigentes=10, prestamos_en_mora=2,
        colocacion_mes=Decimal("500000"), intereses_cobrados_mes=Decimal("80000"),
        punitorios_cobrados_mes=Decimal("5000"), capital_disponible=Decimal("300000"),
    )
    base.update(kw)
    return SnapshotCartera(**base)


async def test_resumen_estado_vacio_sin_snapshot(session):
    r = await servicio.resumen(session)
    assert r["tiene_snapshot"] is False
    assert r["periodo"] is None
    assert r["indice_nexo"] == Decimal("0")
    assert r["prestamos_vigentes"] == 0


async def test_pulso_estado_vacio(session):
    r = await servicio.pulso(session)
    assert r["tiene_snapshot"] is False
    assert r["tarjetas"] == []


async def test_resumen_desde_snapshot(session):
    session.add(_snap())
    await session.flush()
    r = await servicio.resumen(session)
    assert r["tiene_snapshot"] is True
    assert r["periodo"] == date(2026, 6, 11)
    # mora_ratio = 2/10 -> indice = 80
    assert r["indice_nexo"] == Decimal("80")


async def test_indice_cambia_con_snapshot(session):
    session.add(_snap(prestamos_en_mora=2))
    await session.flush()
    r1 = await servicio.resumen(session)
    # nuevo snapshot mas reciente con mas mora -> indice baja
    session.add(_snap(fecha_corte=date(2026, 6, 12), prestamos_en_mora=5))
    await session.flush()
    r2 = await servicio.resumen(session)
    assert r2["indice_nexo"] < r1["indice_nexo"]
    assert r2["periodo"] == date(2026, 6, 12)


async def test_pulso_valores_del_snapshot(session):
    session.add(_snap())
    await session.flush()
    r = await servicio.pulso(session)
    tarjetas = {t["clave"]: t["valor"] for t in r["tarjetas"]}
    assert tarjetas["colocacion_mes"] == "500000.00"
    assert tarjetas["capital_disponible"] == "300000.00"
    assert tarjetas["prestamos_vigentes"] == "10"
