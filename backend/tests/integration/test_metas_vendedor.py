from datetime import date
from decimal import Decimal

from tests.integration.test_comisiones import (
    _crear_vendedor,
    _h,
    _prestamo_con_comision,
)


def _periodo(d: date) -> str:
    return f"{d.year:04d}-{d.month:02d}"


async def test_put_meta_crea_y_get_la_devuelve(client, admin_token):
    vendedor = await _crear_vendedor(client, admin_token, "meta_a@nexo.test")
    periodo = "2026-06"
    r = await client.put(
        f"/api/v1/vendedores/{vendedor['id']}/metas/{periodo}",
        json={"monto_meta": "500000.00", "cantidad_meta": 10},
        headers=_h(admin_token),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["monto_meta"] == "500000.00"
    assert body["cantidad_meta"] == 10
    # sin desembolsos en ese período → avance cero
    assert body["monto_colocado"] == "0.00"
    assert body["cantidad_colocada"] == 0
    assert body["porcentaje_avance"] == "0.0"

    g = await client.get(
        f"/api/v1/vendedores/{vendedor['id']}/metas/{periodo}",
        headers=_h(admin_token),
    )
    assert g.status_code == 200, g.text
    assert g.json()["monto_meta"] == "500000.00"


async def test_put_meta_es_idempotente_actualiza(client, admin_token):
    vendedor = await _crear_vendedor(client, admin_token, "meta_b@nexo.test")
    periodo = "2026-07"
    await client.put(
        f"/api/v1/vendedores/{vendedor['id']}/metas/{periodo}",
        json={"monto_meta": "100000.00"},
        headers=_h(admin_token),
    )
    r = await client.put(
        f"/api/v1/vendedores/{vendedor['id']}/metas/{periodo}",
        json={"monto_meta": "200000.00", "cantidad_meta": 5},
        headers=_h(admin_token),
    )
    assert r.status_code == 200, r.text
    assert r.json()["monto_meta"] == "200000.00"
    assert r.json()["cantidad_meta"] == 5
    # no se duplicó la fila
    g = await client.get(
        f"/api/v1/vendedores/{vendedor['id']}/metas/{periodo}",
        headers=_h(admin_token),
    )
    assert g.json()["monto_meta"] == "200000.00"


async def test_avance_se_calcula_desde_desembolsos_del_periodo(
    client, admin_token, session
):
    """El avance = capital desembolsado del vendedor dentro del mes (Decimal, sin float)."""
    hoy = date.today()
    prestamo, _caja, vendedor = await _prestamo_con_comision(
        client, admin_token, session, "73000001", fecha_negocio=hoy
    )
    # el monto_desembolsado puede ser NULL en este flujo → cae a capital (100000)
    periodo = _periodo(hoy)
    meta = "300000.00"
    await client.put(
        f"/api/v1/vendedores/{vendedor}/metas/{periodo}",
        json={"monto_meta": meta},
        headers=_h(admin_token),
    )
    r = await client.get(
        f"/api/v1/vendedores/{vendedor}/metas/{periodo}",
        headers=_h(admin_token),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    # capital del préstamo desembolsado este mes
    assert Decimal(body["monto_colocado"]) == Decimal("100000.00")
    assert body["cantidad_colocada"] == 1
    # 100000 / 300000 * 100 = 33.3 (ROUND_HALF_UP a 1 decimal)
    assert body["porcentaje_avance"] == "33.3"


async def test_avance_excluye_desembolsos_de_otro_periodo(
    client, admin_token, session
):
    hoy = date.today()
    _prestamo, _caja, vendedor = await _prestamo_con_comision(
        client, admin_token, session, "73000002", fecha_negocio=hoy
    )
    # un período donde no hubo nada (mes futuro lejano)
    r = await client.get(
        f"/api/v1/vendedores/{vendedor}/metas/2099-01",
        headers=_h(admin_token),
    )
    assert r.status_code == 200, r.text
    assert r.json()["monto_colocado"] == "0.00"
    assert r.json()["cantidad_colocada"] == 0


async def test_periodo_invalido_devuelve_400(client, admin_token):
    vendedor = await _crear_vendedor(client, admin_token, "meta_c@nexo.test")
    r = await client.get(
        f"/api/v1/vendedores/{vendedor['id']}/metas/2026-13",
        headers=_h(admin_token),
    )
    assert r.status_code == 400, r.text
    assert r.json()["error"]["code"] == "periodo_invalido"


async def test_get_meta_sin_definir_devuelve_avance_con_meta_cero(
    client, admin_token, session
):
    """GET de un período sin meta fijada: devuelve avance real con meta 0 (no 404)."""
    hoy = date.today()
    _prestamo, _caja, vendedor = await _prestamo_con_comision(
        client, admin_token, session, "73000003", fecha_negocio=hoy
    )
    r = await client.get(
        f"/api/v1/vendedores/{vendedor}/metas/{_periodo(hoy)}",
        headers=_h(admin_token),
    )
    assert r.status_code == 200, r.text
    assert r.json()["monto_meta"] == "0.00"
    assert Decimal(r.json()["monto_colocado"]) == Decimal("100000.00")
    # meta 0 → porcentaje 0.0 (evita división por cero)
    assert r.json()["porcentaje_avance"] == "0.0"


# ── Ownership / IDOR (mismo criterio que comisiones) ─────────────────────────


class TestMetasIDOR:
    async def test_vendedor_no_lee_meta_ajena(self, client, admin_token):
        vendedor_a = await _crear_vendedor(client, admin_token, "meta_own_a@nexo.test")
        vendedor_b = await _crear_vendedor(client, admin_token, "meta_own_b@nexo.test")
        await client.put(
            f"/api/v1/vendedores/{vendedor_a['id']}/metas/2026-06",
            json={"monto_meta": "100000.00"},
            headers=_h(admin_token),
        )
        # A lee la suya
        ok = await client.get(
            f"/api/v1/vendedores/{vendedor_a['id']}/metas/2026-06",
            headers=_h(vendedor_a["token"]),
        )
        assert ok.status_code == 200, ok.text
        # B no puede leer la de A
        r = await client.get(
            f"/api/v1/vendedores/{vendedor_a['id']}/metas/2026-06",
            headers=_h(vendedor_b["token"]),
        )
        assert r.status_code == 403, r.text
        assert r.json()["error"]["code"] == "acceso_denegado"

    async def test_vendedor_no_puede_fijar_meta(self, client, admin_token):
        vendedor = await _crear_vendedor(client, admin_token, "meta_set@nexo.test")
        # fijar meta es admin-only: el vendedor recibe 403
        r = await client.put(
            f"/api/v1/vendedores/{vendedor['id']}/metas/2026-06",
            json={"monto_meta": "100000.00"},
            headers=_h(vendedor["token"]),
        )
        assert r.status_code == 403, r.text

    async def test_admin_fija_y_lee_meta_de_cualquiera(self, client, admin_token):
        vendedor = await _crear_vendedor(client, admin_token, "meta_admin@nexo.test")
        r = await client.put(
            f"/api/v1/vendedores/{vendedor['id']}/metas/2026-08",
            json={"monto_meta": "100000.00"},
            headers=_h(admin_token),
        )
        assert r.status_code == 200, r.text
