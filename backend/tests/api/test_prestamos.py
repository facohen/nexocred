from tests.integration.test_pagos_waterfall import _h, _prestamo_desembolsado


async def test_listar_prestamos_filtro_estado(client, admin_token, session):
    prestamo_id, _caja = await _prestamo_desembolsado(client, admin_token, session)
    r = await client.get(
        "/api/v1/prestamos", params={"estado": "vigente"}, headers=_h(admin_token)
    )
    assert r.status_code == 200, r.text
    ids = [p["id"] for p in r.json()]
    assert prestamo_id in ids

    r = await client.get(
        "/api/v1/prestamos", params={"estado": "cancelado"}, headers=_h(admin_token)
    )
    assert r.status_code == 200, r.text
    assert prestamo_id not in [p["id"] for p in r.json()]


async def test_prestamo_inexistente_404(client, admin_token):
    r = await client.get(
        "/api/v1/prestamos/00000000-0000-0000-0000-000000000000",
        headers=_h(admin_token),
    )
    assert r.status_code == 404, r.text
    assert r.json()["error"]["code"] == "prestamo_no_encontrado"
