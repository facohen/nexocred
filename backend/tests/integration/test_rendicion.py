from datetime import date
from decimal import Decimal

from sqlalchemy import text

from tests.integration._helpers_f1c import cuil_valido, relajar_bcra
from tests.integration.test_pagos_waterfall import _prestamo_desembolsado


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _cobrador_id(session) -> str:
    res = await session.execute(text("SELECT id FROM usuario LIMIT 1"))
    return str(res.scalar_one())


async def _ruta_con_cobro(client, token, session, dni, monto="6000.00", cobrador_id=None):
    await relajar_bcra(client, token)
    _prestamo, caja = await _prestamo_desembolsado(
        client, token, session, fpc_offset=-30, cuil=cuil_valido(dni), dni=dni
    )
    if cobrador_id is None:
        cobrador_id = await _cobrador_id(session)
    r = await client.post(
        "/api/v1/rutas",
        json={"cobrador_id": cobrador_id, "fecha": date.today().isoformat()},
        headers=_h(token),
    )
    ruta_id = r.json()["id"]
    rd = await client.get(f"/api/v1/rutas/{ruta_id}", headers=_h(token))
    parada_id = rd.json()["paradas"][0]["id"]
    await client.post(
        f"/api/v1/rutas/{ruta_id}/paradas/{parada_id}/visitar",
        json={"resultado": "pago", "monto_cobrado": monto, "caja_id": caja,
              "fecha_negocio": date.today().isoformat()},
        headers=_h(token),
    )
    return ruta_id, caja


async def test_rendicion_total_cobrado_y_diferencia(client, admin_token, session):
    ruta_id, _caja = await _ruta_con_cobro(client, admin_token, session, "10101010")
    r = await client.post(
        "/api/v1/rendiciones",
        json={"ruta_id": ruta_id, "fecha_negocio": date.today().isoformat()},
        headers=_h(admin_token),
    )
    assert r.status_code == 201, r.text
    rend = r.json()
    assert rend["total_cobrado"] == "6000.00"
    assert rend["diferencia"] == "6000.00"
    rid = rend["id"]

    # descargo pendiente no afecta diferencia
    rd = await client.post(
        f"/api/v1/rendiciones/{rid}/descargos",
        json={"concepto": "combustible", "monto": "1500.00"},
        headers=_h(admin_token),
    )
    assert rd.status_code == 201, rd.text
    desc_id = rd.json()["id"]

    det = await client.get(f"/api/v1/rendiciones/{rid}", headers=_h(admin_token))
    assert det.json()["diferencia"] == "6000.00"

    # aprobar descargo -> diferencia = 6000 - 1500
    ap = await client.patch(
        f"/api/v1/rendiciones/{rid}/descargos/{desc_id}",
        json={"estado": "aprobado"},
        headers=_h(admin_token),
    )
    assert ap.status_code == 200, ap.text

    det2 = await client.get(f"/api/v1/rendiciones/{rid}", headers=_h(admin_token))
    body = det2.json()
    assert body["total_descargos"] == "1500.00"
    assert body["diferencia"] == "4500.00"

    # reconciliacion: total_cobrado - descargos_aprobados == diferencia
    assert (
        Decimal(body["total_cobrado"]) - Decimal(body["total_descargos"])
        == Decimal(body["diferencia"])
    )


async def test_rendicion_state_machine(client, admin_token, cobrador_usuario, session):
    # Use cobrador_usuario as cobrador so admin (approver) is different from cobrador
    cobrador_id = cobrador_usuario["id"]
    cobrador_token = cobrador_usuario["token"]
    ruta_id, _caja = await _ruta_con_cobro(
        client, admin_token, session, "12121212", cobrador_id=cobrador_id
    )
    r = await client.post(
        "/api/v1/rendiciones", json={"ruta_id": ruta_id}, headers=_h(cobrador_token)
    )
    rid = r.json()["id"]
    assert r.json()["estado"] == "abierta"

    # abierta -> aprobada es invalido (409)
    bad = await client.patch(
        f"/api/v1/rendiciones/{rid}", json={"estado": "aprobada"},
        headers=_h(admin_token),
    )
    assert bad.status_code == 409, bad.text

    # abierta -> presentada -> aprobada ok (cobrador presents, admin approves)
    p = await client.patch(
        f"/api/v1/rendiciones/{rid}", json={"estado": "presentada"},
        headers=_h(cobrador_token),
    )
    assert p.status_code == 200, p.text
    a = await client.patch(
        f"/api/v1/rendiciones/{rid}", json={"estado": "aprobada"},
        headers=_h(admin_token),
    )
    assert a.status_code == 200, a.text
    assert a.json()["estado"] == "aprobada"


async def test_rendicion_duplicada_409(client, admin_token, session):
    ruta_id, _caja = await _ruta_con_cobro(client, admin_token, session, "13131313")
    r1 = await client.post(
        "/api/v1/rendiciones", json={"ruta_id": ruta_id}, headers=_h(admin_token)
    )
    assert r1.status_code == 201
    r2 = await client.post(
        "/api/v1/rendiciones", json={"ruta_id": ruta_id}, headers=_h(admin_token)
    )
    assert r2.status_code == 409, r2.text
