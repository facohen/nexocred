"""Tests de integracion M10: posicion, cashflow, DCF, rotacion, aportes/retiros."""

from datetime import date, timedelta
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


async def _seed(*, con_caja: bool = True, saldo: Decimal = Decimal("500000")):
    engine = create_async_engine(TEST_URL)
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as s:
        persona = await crear_persona(s)
        producto = await crear_producto(s)
        p1 = await crear_prestamo(
            s, persona.id, producto.id, capital=Decimal("100000"),
            fecha_desembolso=HOY.replace(day=1),
            monto_desembolsado=Decimal("100000"),
        )
        # cuota dentro de 15 dias (tramo 30)
        s.add(Cuota(
            prestamo_id=p1.id, numero=1, vencimiento=HOY + timedelta(days=15),
            capital=Decimal("100000"), interes=Decimal("10000"),
            cuota=Decimal("110000"), estado="pendiente",
        ))
        if con_caja:
            s.add(Caja(nombre="Principal", tipo="efectivo", saldo_teorico=saldo))
        await s.commit()
    await engine.dispose()


async def test_posicion_semaforo(client, tesoreria_token):
    await _seed(saldo=Decimal("500000"))
    r = await client.get(
        "/api/v1/tesoreria/posicion", params={"fecha": HOY.isoformat()},
        headers=_h(tesoreria_token),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["capital_disponible"] == "500000.00"
    assert body["capital_colocado"] == "100000.00"
    # utilizacion = 100000/600000 ~ 0.1667 -> verde
    assert body["semaforo"] == "verde"


async def test_cashflow_tramos(client, tesoreria_token):
    await _seed()
    r = await client.get(
        "/api/v1/tesoreria/cashflow", params={"dias": 90, "fecha": HOY.isoformat()},
        headers=_h(tesoreria_token),
    )
    assert r.status_code == 200, r.text
    tramos = {t["dias"]: t for t in r.json()["tramos"]}
    assert tramos[30]["entradas"] == "110000.00"
    assert tramos[30]["neto"] == "110000.00"
    assert set(tramos) == {30, 60, 90}


async def test_dcf_escenarios(client, tesoreria_token):
    await _seed()
    r = await client.get(
        "/api/v1/tesoreria/dcf", params={"fecha": HOY.isoformat()},
        headers=_h(tesoreria_token),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["flujos_nominales"] == "110000.00"
    escenarios = {e["escenario"]: e for e in body["escenarios"]}
    assert set(escenarios) == {"base", "optimista", "pesimista"}
    # VP <= nominal (descuento positivo)
    assert Decimal(escenarios["base"]["valor_presente"]) <= Decimal("110000.00")
    # optimista (menor tasa) descuenta menos que pesimista
    assert (
        Decimal(escenarios["optimista"]["valor_presente"])
        >= Decimal(escenarios["pesimista"]["valor_presente"])
    )


async def test_rotacion(client, tesoreria_token):
    await _seed()
    r = await client.get(
        "/api/v1/tesoreria/rotacion", params={"fecha": HOY.isoformat()},
        headers=_h(tesoreria_token),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["colocacion_periodo"] == "100000.00"
    assert body["capital_promedio"] == "100000.00"


async def test_rbac_no_tesoreria(client, analista_token):
    r = await client.get("/api/v1/tesoreria/posicion", headers=_h(analista_token))
    assert r.status_code == 403
