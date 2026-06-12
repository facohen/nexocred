"""Tests de los disparadores admin on-demand de jobs."""

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.m04_caja.modelos import Caja
from app.modelos_stub import Cuota
from tests._seed_f1d import crear_persona, crear_prestamo, crear_producto
from tests.conftest import TEST_URL

pytestmark = pytest.mark.asyncio

HOY = date(2026, 6, 11)


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _seed() -> None:
    engine = create_async_engine(TEST_URL)
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as s:
        persona = await crear_persona(s)
        producto = await crear_producto(s)
        p = await crear_prestamo(
            s, persona.id, producto.id, capital=Decimal("100000"),
            fecha_desembolso=HOY.replace(day=1),
        )
        s.add(Cuota(
            prestamo_id=p.id, numero=1, vencimiento=HOY,
            capital=Decimal("100000"), interes=Decimal("10000"),
            cuota=Decimal("110000"), estado="pendiente",
        ))
        s.add(Caja(nombre="Principal", tipo="efectivo", saldo_teorico=Decimal("50000")))
        await s.commit()
    await engine.dispose()


async def test_snapshot_trigger(client, admin_token):
    await _seed()
    r = await client.post(
        "/api/v1/torre/snapshot", json={"fecha_corte": HOY.isoformat()},
        headers=_h(admin_token),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["prestamos_vigentes"] == 1
    assert body["capital_disponible"] == "50000.00"


async def test_punitorios_trigger(client, admin_token):
    await _seed()
    r = await client.post(
        "/api/v1/jobs/punitorios", json={"fecha_corte": HOY.isoformat()},
        headers=_h(admin_token),
    )
    assert r.status_code == 200, r.text
    assert "cuotas_actualizadas" in r.json()


async def test_aging_trigger(client, admin_token):
    await _seed()
    r = await client.post(
        "/api/v1/jobs/aging", json={"fecha_corte": HOY.isoformat()},
        headers=_h(admin_token),
    )
    assert r.status_code == 200, r.text
    assert "al_dia" in r.json()["buckets"]


async def test_triggers_solo_admin(client, tesoreria_token):
    for path in ("/api/v1/torre/snapshot", "/api/v1/jobs/punitorios", "/api/v1/jobs/aging"):
        r = await client.post(
            path, json={"fecha_corte": HOY.isoformat()}, headers=_h(tesoreria_token)
        )
        assert r.status_code == 403, path
