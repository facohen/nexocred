"""Tests de integracion M10: posicion, cashflow, DCF, rotacion, aportes/retiros."""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.m04_caja.modelos import Caja
from app.modelos_stub import Cuota
from tests._seed_f1d import crear_persona, crear_prestamo, crear_producto
from tests.conftest import make_test_engine

pytestmark = pytest.mark.asyncio

HOY = date(2026, 6, 11)


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _seed(*, con_caja: bool = True, saldo: Decimal = Decimal("500000")):
    engine = make_test_engine()
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
    # Egresos = costo de fondeo del capital colocado (100000) al 40% anual, 30/365:
    # 100000 * 0.40 * 30/365 = 3287.67  →  neto = 110000 - 3287.67 = 106712.33
    assert tramos[30]["egresos"] == "3287.67"
    assert tramos[30]["neto"] == "106712.33"
    assert set(tramos) == {30, 60, 90}


async def test_cashflow_horizontes_meses(client, tesoreria_token):
    await _seed()
    r = await client.get(
        "/api/v1/tesoreria/cashflow",
        params={"fecha": HOY.isoformat(), "horizontes": "3,12,36"},
        headers=_h(tesoreria_token),
    )
    assert r.status_code == 200, r.text
    tramos = r.json()["tramos"]
    assert [t["meses"] for t in tramos] == [3, 12, 36]
    # cada tramo tiene egreso de fondeo positivo (capital colocado > 0)
    assert all(Decimal(t["egresos"]) > 0 for t in tramos)


async def test_dcf_curva_y_horizontes(client, tesoreria_token):
    await _seed()
    r = await client.get(
        "/api/v1/tesoreria/dcf", params={"fecha": HOY.isoformat()},
        headers=_h(tesoreria_token),
    )
    body = r.json()
    # curva de VP acumulado (escenario base), no decreciente
    curva = body["curva"]
    assert len(curva) >= 1
    acum = [Decimal(p["vp_acumulado"]) for p in curva]
    assert acum == sorted(acum)
    # cada escenario reparte su VP por ventana temporal
    base = next(e for e in body["escenarios"] if e["escenario"] == "base")
    etiquetas = {h["etiqueta"] for h in base["vp_por_horizonte"]}
    assert etiquetas == {"0-6m", "6-12m", "12m+"}


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


async def _crear_caja(client, token, nombre="Caja") -> str:
    r = await client.post(
        "/api/v1/cajas", json={"nombre": nombre, "tipo": "efectivo"},
        headers=_h(token),
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def test_aporte_asienta_ingreso_en_caja(client, admin_token):
    caja_id = await _crear_caja(client, admin_token)
    r = await client.post(
        "/api/v1/tesoreria/aportes",
        json={"monto": "250000.00", "fecha_negocio": HOY.isoformat(),
              "caja_id": caja_id, "inversor": "Socio A"},
        headers=_h(admin_token),
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["tipo"] == "aporte"
    assert body["monto"] == "250000.00"
    assert body["movimiento_id"] is not None

    # reconcilia: saldo de caja == aporte
    r = await client.get("/api/v1/cajas", headers=_h(admin_token))
    caja = next(c for c in r.json()["data"] if c["id"] == caja_id)
    assert caja["saldo_teorico"] == "250000.00"

    # posicion refleja capital disponible
    r = await client.get(
        "/api/v1/tesoreria/posicion", params={"fecha": HOY.isoformat()},
        headers=_h(admin_token),
    )
    assert r.json()["capital_disponible"] == "250000.00"


async def test_retiro_asienta_egreso(client, admin_token):
    caja_id = await _crear_caja(client, admin_token)
    await client.post(
        "/api/v1/tesoreria/aportes",
        json={"monto": "300000.00", "fecha_negocio": HOY.isoformat(),
              "caja_id": caja_id},
        headers=_h(admin_token),
    )
    r = await client.post(
        "/api/v1/tesoreria/retiros",
        json={"monto": "100000.00", "fecha_negocio": HOY.isoformat(),
              "caja_id": caja_id},
        headers=_h(admin_token),
    )
    assert r.status_code == 201, r.text
    assert r.json()["tipo"] == "retiro"
    r = await client.get("/api/v1/cajas", headers=_h(admin_token))
    caja = next(c for c in r.json()["data"] if c["id"] == caja_id)
    assert caja["saldo_teorico"] == "200000.00"


async def test_retiro_mayor_a_saldo_rechazado(client, admin_token):
    """Un retiro que dejaria la caja en saldo negativo se rechaza (409) y no
    asienta ningun movimiento ni altera el saldo."""
    caja_id = await _crear_caja(client, admin_token)
    await client.post(
        "/api/v1/tesoreria/aportes",
        json={"monto": "100000.00", "fecha_negocio": HOY.isoformat(),
              "caja_id": caja_id},
        headers=_h(admin_token),
    )
    r = await client.post(
        "/api/v1/tesoreria/retiros",
        json={"monto": "150000.00", "fecha_negocio": HOY.isoformat(),
              "caja_id": caja_id},
        headers=_h(admin_token),
    )
    assert r.status_code == 409, r.text
    assert r.json()["error"]["code"] == "saldo_insuficiente"
    # saldo intacto
    r = await client.get("/api/v1/cajas", headers=_h(admin_token))
    caja = next(c for c in r.json()["data"] if c["id"] == caja_id)
    assert caja["saldo_teorico"] == "100000.00"


async def test_aporte_idempotente(client, admin_token):
    caja_id = await _crear_caja(client, admin_token)
    headers = {**_h(admin_token), "Idempotency-Key": "ap-1"}
    payload = {"monto": "150000.00", "fecha_negocio": HOY.isoformat(),
               "caja_id": caja_id}
    r1 = await client.post("/api/v1/tesoreria/aportes", json=payload, headers=headers)
    r2 = await client.post("/api/v1/tesoreria/aportes", json=payload, headers=headers)
    assert r1.status_code == 201 and r2.status_code == 201
    assert r1.json()["id"] == r2.json()["id"]
    # saldo no se duplica
    r = await client.get("/api/v1/cajas", headers=_h(admin_token))
    caja = next(c for c in r.json()["data"] if c["id"] == caja_id)
    assert caja["saldo_teorico"] == "150000.00"


async def test_listar_aportes_retiros(client, admin_token):
    caja_id = await _crear_caja(client, admin_token)
    await client.post(
        "/api/v1/tesoreria/aportes",
        json={"monto": "100000.00", "fecha_negocio": HOY.isoformat(),
              "caja_id": caja_id},
        headers=_h(admin_token),
    )
    r = await client.get("/api/v1/tesoreria/aportes-retiros", headers=_h(admin_token))
    assert r.status_code == 200
    assert len(r.json()["data"]) == 1
    assert r.json()["data"][0]["monto"] == "100000.00"
