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
    shares = c.json()["data"]
    total_share = sum(Decimal(s["share"]) for s in shares)
    assert total_share <= Decimal("1.0001")

    cos = await client.get("/api/v1/riesgo/cosechas", headers=_h(admin_token))
    assert cos.status_code == 200, cos.text
    assert len(cos.json()["data"]) >= 1


async def test_concentracion_clave_invalida(client, admin_token):
    r = await client.get(
        "/api/v1/riesgo/concentracion?clave=foo", headers=_h(admin_token)
    )
    assert r.status_code == 422, r.text


async def test_tablero_filtro_zona_texto_sin_resultados(client, admin_token):
    """Filtrar por zona='BA' cuando ningun prestamo tiene esa zona → metricas en cero."""
    r = await client.get(
        "/api/v1/riesgo/tablero?zona=BA_INEXISTENTE", headers=_h(admin_token)
    )
    assert r.status_code == 200, r.text
    body = r.json()
    # Sin prestamos en esa zona: PAR debe ser 0 y cartera_total debe ser 0
    from decimal import Decimal
    assert Decimal(body["par30"]) == Decimal("0")
    assert Decimal(body["cartera_total"]) == Decimal("0")


async def test_tablero_filtro_zona_texto_acepta_param(client, admin_token, session):
    """Filtro zona= (texto) se acepta como query param y retorna 200."""
    await relajar_bcra(client, admin_token)
    await _prestamo_desembolsado(
        client, admin_token, session, fpc_offset=-30,
        cuil=cuil_valido("81000044"), dni="81000044",
    )
    # Pasar zona como string → debe aceptar sin 422
    r = await client.get(
        "/api/v1/riesgo/tablero?zona=norte&sector=comercial", headers=_h(admin_token)
    )
    assert r.status_code == 200, r.text
