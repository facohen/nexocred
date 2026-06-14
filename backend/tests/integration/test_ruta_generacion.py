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


async def test_genera_ruta_solo_con_paradas_exigibles(client, admin_token, session):
    await relajar_bcra(client, admin_token)
    # prestamo vencido (exigible) y prestamo no vencido (sin saldo exigible hoy).
    p_vencido, _ = await _prestamo_desembolsado(
        client, admin_token, session, fpc_offset=-30, cuil=cuil_valido("11111111"), dni="11111111"
    )
    p_futuro, _ = await _prestamo_desembolsado(
        client, admin_token, session, fpc_offset=30, cuil=cuil_valido("22222222"), dni="22222222"
    )
    cobrador = await _cobrador_id(session)

    r = await client.post(
        "/api/v1/rutas",
        json={"cobrador_id": cobrador, "fecha": date.today().isoformat()},
        headers=_h(admin_token),
    )
    assert r.status_code == 201, r.text
    ruta_id = r.json()["id"]
    assert r.json()["estado"] == "abierta"

    r2 = await client.get(f"/api/v1/rutas/{ruta_id}/paradas", headers=_h(admin_token))
    assert r2.status_code == 200, r2.text
    paradas = r2.json()
    prestamos = {p["prestamo_id"] for p in paradas}
    assert p_vencido in prestamos
    assert p_futuro not in prestamos
    # saldo exigible es string con 2 decimales y > 0
    for p in paradas:
        assert Decimal(p["saldo_exigible"]) > 0


async def test_listar_y_detalle_ruta(client, admin_token, session):
    await relajar_bcra(client, admin_token)
    await _prestamo_desembolsado(
        client, admin_token, session, fpc_offset=-30, cuil=cuil_valido("33333333"), dni="33333333"
    )
    cobrador = await _cobrador_id(session)
    r = await client.post(
        "/api/v1/rutas",
        json={"cobrador_id": cobrador, "fecha": date.today().isoformat()},
        headers=_h(admin_token),
    )
    ruta_id = r.json()["id"]

    rl = await client.get(
        f"/api/v1/rutas?fecha={date.today().isoformat()}", headers=_h(admin_token)
    )
    assert rl.status_code == 200
    assert any(rr["id"] == ruta_id for rr in rl.json()["data"])

    rd = await client.get(f"/api/v1/rutas/{ruta_id}", headers=_h(admin_token))
    assert rd.status_code == 200
    body = rd.json()
    assert len(body["paradas"]) == 1
    assert body["paradas"][0]["orden"] == 1


async def _ruta_con_parada(client, token, session, dni, offset=-30):
    await relajar_bcra(client, token)
    prestamo, caja = await _prestamo_desembolsado(
        client, token, session, fpc_offset=offset, cuil=cuil_valido(dni), dni=dni
    )
    cobrador = await _cobrador_id(session)
    r = await client.post(
        "/api/v1/rutas",
        json={"cobrador_id": cobrador, "fecha": date.today().isoformat()},
        headers=_h(token),
    )
    ruta_id = r.json()["id"]
    rd = await client.get(f"/api/v1/rutas/{ruta_id}", headers=_h(token))
    parada_id = rd.json()["paradas"][0]["id"]
    return ruta_id, parada_id, prestamo, caja


async def test_visitar_con_pago_registra_cobro(client, admin_token, session):
    ruta_id, parada_id, prestamo, caja = await _ruta_con_parada(
        client, admin_token, session, "44444444"
    )
    r = await client.post(
        f"/api/v1/rutas/{ruta_id}/paradas/{parada_id}/visitar",
        json={"resultado": "pago", "monto_cobrado": "5000.00", "caja_id": caja,
              "lat": "-34.6037", "lng": "-58.3816", "foto_url": "http://f/1.jpg",
              "fecha_negocio": date.today().isoformat()},
        headers=_h(admin_token),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["resultado"] == "pago"
    assert body["pago_id"] is not None

    # el pago quedo vinculado a la parada y a canal ruta
    res = await session.execute(
        text("SELECT prestamo_id, parada_id, canal, monto FROM pago WHERE id=:p"),
        {"p": body["pago_id"]},
    )
    row = res.one()
    assert str(row[0]) == prestamo
    assert str(row[1]) == parada_id
    assert row[2] == "ruta"
    assert row[3] == Decimal("5000.00")

    # la parada guarda resultado/geotag
    res = await session.execute(
        text("SELECT resultado, lat, lng, visitada_en FROM parada_ruta WHERE id=:p"),
        {"p": parada_id},
    )
    res_row = res.one()
    assert res_row[0] == "pago"
    assert res_row[3] is not None


async def test_visitar_promesa_sin_pago(client, admin_token, session):
    ruta_id, parada_id, _prestamo, _caja = await _ruta_con_parada(
        client, admin_token, session, "55555555"
    )
    r = await client.post(
        f"/api/v1/rutas/{ruta_id}/paradas/{parada_id}/visitar",
        json={"resultado": "promesa", "notas": "vuelve el viernes"},
        headers=_h(admin_token),
    )
    assert r.status_code == 200, r.text
    assert r.json()["pago_id"] is None
    res = await session.execute(
        text("SELECT count(*) FROM pago WHERE parada_id=:p"), {"p": parada_id}
    )
    assert res.scalar_one() == 0


async def test_visitar_resultado_invalido(client, admin_token, session):
    ruta_id, parada_id, _p, _c = await _ruta_con_parada(
        client, admin_token, session, "66666666"
    )
    r = await client.post(
        f"/api/v1/rutas/{ruta_id}/paradas/{parada_id}/visitar",
        json={"resultado": "explotado"},
        headers=_h(admin_token),
    )
    assert r.status_code == 422, r.text
