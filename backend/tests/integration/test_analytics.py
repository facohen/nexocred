"""Tests de integracion M14 analytics: rentabilidad por dimension + resumen."""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.modelos_stub import Cuota, Imputacion, Pago
from tests._seed_f1d import crear_persona, crear_prestamo, crear_producto
from tests.conftest import make_test_engine

pytestmark = pytest.mark.asyncio

HOY = date(2026, 6, 11)


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _seed():
    engine = make_test_engine()
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as s:
        persona = await crear_persona(s)
        producto = await crear_producto(s)
        # Prestamo desembolsado hace 60 dias, con una cuota pendiente y un pago
        # parcial de interes ya cobrado.
        p1 = await crear_prestamo(
            s, persona.id, producto.id, capital=Decimal("100000"),
            fecha_desembolso=HOY - timedelta(days=60),
            monto_desembolsado=Decimal("100000"),
        )
        s.add(Cuota(
            prestamo_id=p1.id, numero=1, vencimiento=HOY + timedelta(days=10),
            capital=Decimal("100000"), interes=Decimal("20000"),
            cuota=Decimal("120000"), estado="pendiente",
        ))
        pago = Pago(prestamo_id=p1.id, monto=Decimal("5000"), estado="registrado",
                    fecha_negocio=HOY - timedelta(days=5))
        s.add(pago)
        await s.flush()
        s.add(Imputacion(
            pago_id=pago.id, concepto="interes_vencido", monto=Decimal("5000"),
            orden_waterfall=1, cuota_numero=1,
        ))
        await s.commit()
    await engine.dispose()


async def test_rentabilidad_por_producto(client, tesoreria_token):
    await _seed()
    r = await client.get(
        "/api/v1/analytics/rentabilidad",
        params={"dimension": "producto", "fecha": HOY.isoformat()},
        headers=_h(tesoreria_token),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] >= 1
    item = body["data"][0]
    # interes cobrado = 5000 (la imputacion de interes)
    assert item["interes_cobrado"] == "5000.00"
    # tiene todos los componentes de rentabilidad
    for campo in ("capital", "costo_fondeo", "pe_monetaria", "margen_neto", "rentabilidad_pct"):
        assert campo in item


async def test_resumen_cartera(client, tesoreria_token):
    await _seed()
    r = await client.get(
        "/api/v1/analytics/resumen", params={"fecha": HOY.isoformat()},
        headers=_h(tesoreria_token),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["capital_total"] == "100000.00"
    assert body["n_prestamos"] == 1
    assert body["mejor_producto"] is not None


async def test_dimension_invalida_cae_a_producto(client, tesoreria_token):
    await _seed()
    r = await client.get(
        "/api/v1/analytics/rentabilidad",
        params={"dimension": "inexistente", "fecha": HOY.isoformat()},
        headers=_h(tesoreria_token),
    )
    assert r.status_code == 200, r.text


async def test_analytics_requiere_rol(client):
    # sin token → 401/403
    r = await client.get("/api/v1/analytics/resumen")
    assert r.status_code in (401, 403)
