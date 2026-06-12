"""Tests de integracion La Torre: endpoints desde snapshot persistido + live data."""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.modelos_stub import Alerta, Cuota, SnapshotCartera
from tests._seed_f1d import crear_persona, crear_prestamo, crear_producto
from tests.conftest import make_test_engine

pytestmark = pytest.mark.asyncio

HOY = date(2026, 6, 11)


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _seed_snapshot(**kw) -> None:
    base = dict(
        fecha_corte=HOY, prestamos_vigentes=10, prestamos_en_mora=2,
        colocacion_mes=Decimal("500000"), intereses_cobrados_mes=Decimal("80000"),
        punitorios_cobrados_mes=Decimal("5000"), capital_disponible=Decimal("300000"),
    )
    base.update(kw)
    engine = make_test_engine()
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as s:
        s.add(SnapshotCartera(**base))
        await s.commit()
    await engine.dispose()


async def _seed_live() -> None:
    engine = make_test_engine()
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
        s.add(Alerta(prestamo_id=p.id, persona_id=persona.id, tipo="par30",
                     estado="activa", severidad="alta", metrica="par30",
                     valor=Decimal("0.15")))
        await s.commit()
    await engine.dispose()


async def test_resumen_empty_state(client, tesoreria_token):
    r = await client.get("/api/v1/torre/resumen", headers=_h(tesoreria_token))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["tiene_snapshot"] is False
    assert body["periodo"] is None
    assert body["indice_nexo"] == "0"


async def test_resumen_desde_snapshot(client, tesoreria_token):
    await _seed_snapshot()
    r = await client.get("/api/v1/torre/resumen", headers=_h(tesoreria_token))
    body = r.json()
    assert body["tiene_snapshot"] is True
    assert body["indice_nexo"] == "80"
    assert body["prestamos_vigentes"] == 10


async def test_pulso_kpi_cambia_con_snapshot(client, tesoreria_token):
    await _seed_snapshot(colocacion_mes=Decimal("500000"))
    r1 = await client.get("/api/v1/torre/pulso", headers=_h(tesoreria_token))
    t1 = {t["clave"]: t["valor"] for t in r1.json()["tarjetas"]}
    assert t1["colocacion_mes"] == "500000.00"

    # snapshot mas reciente con otra colocacion -> KPI cambia
    await _seed_snapshot(fecha_corte=HOY + timedelta(days=1),
                         colocacion_mes=Decimal("999000"))
    r2 = await client.get("/api/v1/torre/pulso", headers=_h(tesoreria_token))
    t2 = {t["clave"]: t["valor"] for t in r2.json()["tarjetas"]}
    assert t2["colocacion_mes"] == "999000.00"


async def test_salud_cartera(client, tesoreria_token):
    await _seed_snapshot()
    await _seed_live()
    r = await client.get(
        "/api/v1/torre/salud-cartera", params={"fecha": HOY.isoformat()},
        headers=_h(tesoreria_token),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["tiene_snapshot"] is True
    assert "aging" in body and "al_dia" in body["aging"]


async def test_operacion_hoy_live(client, tesoreria_token):
    await _seed_live()
    r = await client.get(
        "/api/v1/torre/operacion-hoy", params={"fecha": HOY.isoformat()},
        headers=_h(tesoreria_token),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["cuotas_vencen_hoy"] == 1
    assert body["cobranza_del_dia"] == "110000.00"


async def test_negocio(client, tesoreria_token):
    await _seed_snapshot()
    r = await client.get(
        "/api/v1/torre/negocio", params={"fecha": HOY.isoformat()},
        headers=_h(tesoreria_token),
    )
    assert r.status_code == 200, r.text
    assert r.json()["colocacion_mes"] == "500000.00"


async def test_alertas_live(client, tesoreria_token):
    await _seed_live()
    r = await client.get("/api/v1/torre/alertas-live", headers=_h(tesoreria_token))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] == 1
    assert body["alertas"][0]["tipo"] == "par30"
    assert body["alertas"][0]["prestamo_id"] is not None


async def test_rbac_torre(client, analista_token):
    r = await client.get("/api/v1/torre/resumen", headers=_h(analista_token))
    assert r.status_code == 403
