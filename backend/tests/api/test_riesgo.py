from decimal import Decimal

from tests.integration._helpers_f1c import cuil_valido, relajar_bcra
from tests.integration.test_pagos_waterfall import _prestamo_desembolsado


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def test_tablero_riesgo_calcula_par(client, admin_token, session):
    await relajar_bcra(client, admin_token)
    # un prestamo vencido (en mora) y uno al dia
    await _prestamo_desembolsado(
        client, admin_token, session, fpc_offset=-120,
        cuil=cuil_valido("81000011"), dni="81000011",
    )
    await _prestamo_desembolsado(
        client, admin_token, session, fpc_offset=30,
        cuil=cuil_valido("81000022"), dni="81000022",
    )
    r = await client.get("/api/v1/riesgo/tablero", headers=_h(admin_token))
    assert r.status_code == 200, r.text
    body = r.json()
    # PAR debe ser una ratio string 4 decimales y >= 0
    assert Decimal(body["par30"]) >= 0
    assert "al_dia" in body["aging"]
    assert Decimal(body["cartera_total"]) > 0


async def test_concentracion_y_cosechas(client, admin_token, session):
    await relajar_bcra(client, admin_token)
    await _prestamo_desembolsado(
        client, admin_token, session, fpc_offset=-30,
        cuil=cuil_valido("81000033"), dni="81000033",
    )
    c = await client.get(
        "/api/v1/riesgo/concentracion?clave=producto_id", headers=_h(admin_token)
    )
    assert c.status_code == 200, c.text
    shares = c.json()
    total_share = sum(Decimal(s["share"]) for s in shares)
    assert total_share <= Decimal("1.0001")

    cos = await client.get("/api/v1/riesgo/cosechas", headers=_h(admin_token))
    assert cos.status_code == 200, cos.text
    assert len(cos.json()) >= 1


async def test_concentracion_clave_invalida(client, admin_token):
    r = await client.get(
        "/api/v1/riesgo/concentracion?clave=foo", headers=_h(admin_token)
    )
    assert r.status_code == 422, r.text
