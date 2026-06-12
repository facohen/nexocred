from datetime import date

from sqlalchemy import text

from tests.integration.test_pagos_waterfall import _h, _prestamo_desembolsado


async def test_prestamo_detalle_y_cuotas(client, admin_token, session):
    prestamo_id, _caja = await _prestamo_desembolsado(client, admin_token, session)
    r = await client.get(f"/api/v1/prestamos/{prestamo_id}", headers=_h(admin_token))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["estado"] == "vigente"
    assert body["snapshot_terminos"]["cantidad_cuotas"] == 6
    assert body["capital"] == "100000.00"

    r = await client.get(
        f"/api/v1/prestamos/{prestamo_id}/cuotas", headers=_h(admin_token)
    )
    assert r.status_code == 200, r.text
    cuotas = r.json()
    assert len(cuotas) == 6
    assert "." in cuotas[0]["capital"]


async def test_payoff(client, admin_token, session):
    prestamo_id, _caja = await _prestamo_desembolsado(client, admin_token, session)
    r = await client.get(
        f"/api/v1/prestamos/{prestamo_id}/payoff",
        params={"fecha_negocio": date.today().isoformat()},
        headers=_h(admin_token),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    # capital 100000 + interes 30000 = total 130000 (sin punitorio, tasa 0)
    assert body["total"] == "130000.00"
    assert body["capital"] == "100000.00"
    assert body["interes"] == "30000.00"


async def test_pagos_history(client, admin_token, session):
    prestamo_id, caja = await _prestamo_desembolsado(client, admin_token, session)
    await client.post(
        "/api/v1/pagos",
        json={"prestamo_id": prestamo_id, "monto": "10000.00", "canal": "mostrador",
              "caja_id": caja, "fecha_negocio": date.today().isoformat()},
        headers={**_h(admin_token), "Idempotency-Key": "ph-1"},
    )
    r = await client.get(
        f"/api/v1/prestamos/{prestamo_id}/pagos", headers=_h(admin_token)
    )
    assert r.status_code == 200, r.text
    pagos = r.json()
    assert len(pagos) == 1
    assert len(pagos[0]["imputaciones"]) >= 1


async def test_cancelacion_consume_payoff(client, admin_token, session):
    prestamo_id, caja = await _prestamo_desembolsado(client, admin_token, session)
    # payoff antes de cancelar = 130000
    r = await client.post(
        f"/api/v1/prestamos/{prestamo_id}/cancelar",
        json={"caja_id": caja, "fecha_negocio": date.today().isoformat(),
              "canal": "mostrador"},
        headers={**_h(admin_token), "Idempotency-Key": "cancel-1"},
    )
    assert r.status_code == 201, r.text
    # el pago de cancelacion consume el payoff total
    assert r.json()["monto"] == "130000.00"

    res = await session.execute(
        text("SELECT estado FROM prestamo WHERE id=:p"), {"p": prestamo_id}
    )
    assert res.scalar_one() == "cancelado"

    # la cuota vencida quedo saldada por la cancelacion
    res = await session.execute(
        text("SELECT estado FROM cuota WHERE prestamo_id=:p AND numero=1"),
        {"p": prestamo_id},
    )
    assert res.scalar_one() == "pagada"


async def test_cancelacion_idempotente(client, admin_token, session):
    prestamo_id, caja = await _prestamo_desembolsado(client, admin_token, session)
    headers = {**_h(admin_token), "Idempotency-Key": "cancel-idem"}
    body = {"caja_id": caja, "fecha_negocio": date.today().isoformat(),
            "canal": "mostrador"}
    r1 = await client.post(
        f"/api/v1/prestamos/{prestamo_id}/cancelar", json=body, headers=headers
    )
    assert r1.status_code == 201, r1.text
    r2 = await client.post(
        f"/api/v1/prestamos/{prestamo_id}/cancelar", json=body, headers=headers
    )
    assert r2.status_code == 201, r2.text
    res = await session.execute(
        text("SELECT count(*) FROM pago WHERE prestamo_id=:p"), {"p": prestamo_id}
    )
    assert res.scalar_one() == 1
