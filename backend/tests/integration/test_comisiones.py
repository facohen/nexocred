from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import text

from tests.api.test_solicitudes import (
    cargar_tasa,
    crear_perfil,
    crear_persona,
    crear_producto,
    crear_solicitud,
    sync_bcra,
)
from tests.integration._helpers_f1c import cuil_valido, relajar_bcra
from tests.integration.test_desembolso import _crear_caja


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _cargar_comision(client, token, producto, perfil, comision="0.05"):
    r = await client.put(
        "/api/v1/matrices/comisiones",
        json={"celdas": [{"producto_id": producto, "perfil_id": perfil,
                          "comision": comision}]},
        headers=_h(token),
    )
    assert r.status_code == 200, r.text


async def _vendedor_id(session) -> str:
    res = await session.execute(text("SELECT id FROM usuario LIMIT 1"))
    return str(res.scalar_one())


async def _prestamo_con_comision(client, token, session, dni, comision="0.05"):
    await relajar_bcra(client, token)
    persona = await crear_persona(client, token, cuil=cuil_valido(dni), dni=dni)
    producto = await crear_producto(client, token)
    perfil = await crear_perfil(client, token)
    await cargar_tasa(client, token, producto, perfil, 6, tasa="0.30")
    await _cargar_comision(client, token, producto, perfil, comision)
    await sync_bcra(client, token, persona)
    sid = await crear_solicitud(client, token, persona, producto, cantidad_cuotas=6)
    # asignar vendedor a la solicitud antes de evaluar/aprobar
    vendedor = await _vendedor_id(session)
    await session.execute(
        text("UPDATE solicitud_credito SET vendedor_id=:v WHERE id=:s"),
        {"v": vendedor, "s": sid},
    )
    await session.commit()
    await client.post(f"/api/v1/solicitudes/{sid}/evaluar", headers=_h(token))
    ap = await client.patch(
        f"/api/v1/solicitudes/{sid}/estado", json={"estado": "aprobada"},
        headers=_h(token),
    )
    assert ap.status_code == 200, ap.text

    caja = await _crear_caja(client, token)
    r = await client.post(
        f"/api/v1/solicitudes/{sid}/desembolsar",
        json={"caja_id": caja, "fecha_negocio": date.today().isoformat(),
              "fecha_primera_cuota": (date.today() + timedelta(days=30)).isoformat(),
              "tasa_punitorio_diario": "0"},
        headers={**_h(token), "Idempotency-Key": f"des-com-{dni}"},
    )
    assert r.status_code == 201, r.text
    return r.json()["prestamo_id"], caja, vendedor


async def test_devengo_en_desembolso(client, admin_token, session):
    prestamo, _caja, vendedor = await _prestamo_con_comision(
        client, admin_token, session, "71000001"
    )
    r = await client.get(
        f"/api/v1/comisiones/devengo/{prestamo}", headers=_h(admin_token)
    )
    assert r.status_code == 200, r.text
    devengos = r.json()
    assert len(devengos) == 1
    d = devengos[0]
    assert d["estado"] == "devengada"
    # capital 100000 * 0.05 = 5000.00
    assert d["monto"] == "5000.00"
    assert d["vendedor_id"] == vendedor


async def test_clawback_crea_negativo(client, admin_token, session):
    prestamo, _caja, _vendedor = await _prestamo_con_comision(
        client, admin_token, session, "71000002"
    )
    r = await client.post(
        "/api/v1/comisiones/clawback",
        json={"prestamo_id": prestamo, "motivo": "cancelacion temprana"},
        headers=_h(admin_token),
    )
    assert r.status_code == 201, r.text
    assert r.json()["estado"] == "clawback"
    assert Decimal(r.json()["monto"]) == Decimal("-5000.00")
    assert r.json()["clawback_de_id"] is not None

    # ahora el devengo original quedo en estado clawback
    lst = await client.get(
        f"/api/v1/comisiones/devengo/{prestamo}", headers=_h(admin_token)
    )
    estados = {d["estado"] for d in lst.json()}
    assert estados == {"clawback"}


async def test_liquidacion_pago_reconcilia_con_egreso(client, admin_token, session):
    prestamo, _caja, vendedor = await _prestamo_con_comision(
        client, admin_token, session, "71000003"
    )
    hoy = date.today()
    gen = await client.post(
        "/api/v1/comisiones/liquidaciones",
        json={"vendedor_id": vendedor,
              "periodo_desde": (hoy - timedelta(days=1)).isoformat(),
              "periodo_hasta": (hoy + timedelta(days=1)).isoformat()},
        headers=_h(admin_token),
    )
    assert gen.status_code == 201, gen.text
    liq = gen.json()
    lid = liq["id"]
    assert liq["estado"] == "borrador"
    assert liq["monto_total"] == "5000.00"
    assert len(liq["detalle"]) == 1
    suma_detalle = sum(Decimal(d["monto"]) for d in liq["detalle"])
    assert suma_detalle == Decimal("5000.00")

    # aprobar
    ap = await client.patch(
        f"/api/v1/comisiones/liquidaciones/{lid}/aprobar", headers=_h(admin_token)
    )
    assert ap.status_code == 200, ap.text
    assert ap.json()["estado"] == "aprobada"

    # pagar con caja egreso
    caja = await _crear_caja(client, admin_token, nombre="Caja Comisiones")
    pay = await client.post(
        f"/api/v1/comisiones/liquidaciones/{lid}/pagar",
        json={"caja_id": caja, "fecha_negocio": hoy.isoformat()},
        headers={**_h(admin_token), "Idempotency-Key": f"pay-{lid}"},
    )
    assert pay.status_code == 200, pay.text
    assert pay.json()["estado"] == "pagada"
    egreso_id = pay.json()["egreso_id"]
    assert egreso_id is not None

    # reconciliacion: egreso == monto_total == sum(detalle)
    res = await session.execute(
        text("SELECT monto, tipo FROM movimiento_caja WHERE id=:m"), {"m": egreso_id}
    )
    monto, tipo = res.one()
    assert tipo == "egreso"
    assert monto == Decimal("5000.00")

    # devengos quedaron liquidada
    res = await session.execute(
        text("SELECT estado FROM comision_devengo WHERE prestamo_id=:p"),
        {"p": prestamo},
    )
    assert res.scalar_one() == "liquidada"

    # idempotente: re-pagar no duplica egreso
    pay2 = await client.post(
        f"/api/v1/comisiones/liquidaciones/{lid}/pagar",
        json={"caja_id": caja, "fecha_negocio": hoy.isoformat()},
        headers={**_h(admin_token), "Idempotency-Key": f"pay-{lid}"},
    )
    assert pay2.status_code == 200, pay2.text
    res = await session.execute(
        text("SELECT count(*) FROM movimiento_caja WHERE referencia=:r AND categoria='comisiones'"),
        {"r": lid},
    )
    assert res.scalar_one() == 1
