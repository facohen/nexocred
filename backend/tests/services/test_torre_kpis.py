"""Tests de servicio La Torre: indice Nexo, estado vacio, derivacion del snapshot."""

from datetime import date, timedelta
from decimal import Decimal

import pytest

from app.m11_torre import servicio
from app.modelos_stub import SnapshotCartera
from tests._seed_f1d import crear_persona, crear_prestamo, crear_producto

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


async def test_negocio_top_usa_fecha_corte_del_snapshot(session):
    """Consistencia as-of: cuando hay snapshot, los top_vendedores/top_productos
    (live) usan la fecha de corte del snapshot como referencia, NO la fecha de
    pared. Un desembolso POSTERIOR al corte (pero mismo mes) no debe aparecer, para
    que el response no mezcle colocacion_mes (as-of corte) con tops (al dia de hoy).
    """
    fecha_corte = date(2026, 6, 11)
    session.add(_snap(fecha_corte=fecha_corte, colocacion_mes=Decimal("100000")))
    persona = await crear_persona(session)
    producto = await crear_producto(session)
    # Desembolso al/antes del corte -> cuenta.
    await crear_prestamo(
        session, persona.id, producto.id, capital=Decimal("100000"),
        fecha_desembolso=fecha_corte, monto_desembolsado=Decimal("100000"),
    )
    # Desembolso POSTERIOR al corte, mismo mes -> NO debe contar en los tops.
    await crear_prestamo(
        session, persona.id, producto.id, capital=Decimal("777777"),
        fecha_desembolso=fecha_corte + timedelta(days=5),
        monto_desembolsado=Decimal("777777"),
    )
    await session.flush()

    # Llamamos con fecha de pared "hoy" posterior al corte.
    r = await servicio.negocio(session, fecha_corte + timedelta(days=10))
    total_tops = sum(v["valor"] for v in r["top_productos"])
    assert total_tops == Decimal("100000.00")


async def test_pulso_valores_del_snapshot(session):
    session.add(_snap())
    await session.flush()
    r = await servicio.pulso(session)
    tarjetas = {t["clave"]: t["valor"] for t in r["tarjetas"]}
    assert tarjetas["colocacion_mes"] == "500000.00"
    assert tarjetas["capital_disponible"] == "300000.00"
    assert tarjetas["prestamos_vigentes"] == "10"
