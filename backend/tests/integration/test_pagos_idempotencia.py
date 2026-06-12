from datetime import date

from sqlalchemy import text

from tests.integration.test_pagos_waterfall import _h, _prestamo_desembolsado


async def test_pago_idempotente_no_duplica(client, admin_token, session):
    prestamo_id, caja = await _prestamo_desembolsado(client, admin_token, session)
    body = {"prestamo_id": prestamo_id, "monto": "10000.00", "canal": "mostrador",
            "caja_id": caja, "fecha_negocio": date.today().isoformat()}
    headers = {**_h(admin_token), "Idempotency-Key": "pago-idem"}
    r1 = await client.post("/api/v1/pagos", json=body, headers=headers)
    assert r1.status_code == 201, r1.text
    r2 = await client.post("/api/v1/pagos", json=body, headers=headers)
    assert r2.status_code == 201, r2.text
    assert r1.json()["id"] == r2.json()["id"]

    # un solo pago
    res = await session.execute(
        text("SELECT count(*) FROM pago WHERE prestamo_id=:p"), {"p": prestamo_id}
    )
    assert res.scalar_one() == 1
    # imputaciones no duplicadas
    res = await session.execute(
        text(
            "SELECT count(*) FROM imputacion i JOIN pago p ON i.pago_id=p.id "
            "WHERE p.prestamo_id=:pr"
        ),
        {"pr": prestamo_id},
    )
    n_imp = res.scalar_one()
    # un solo movimiento de caja de pago
    res = await session.execute(
        text("SELECT count(*) FROM movimiento_caja WHERE pago_id IS NOT NULL")
    )
    assert res.scalar_one() == 1
    assert n_imp >= 1
