from datetime import date

from sqlalchemy import text

from tests.integration.test_pagos_waterfall import _h, _prestamo_desembolsado


async def _set_tolerancia(client, token, valor: str) -> None:
    r = await client.patch(
        "/api/v1/parametros",
        json={"tolerancia_cobro": valor},
        headers=_h(token),
    )
    assert r.status_code == 200, r.text


async def test_pago_dentro_de_tolerancia_cierra_cuota_tolerada(
    client, admin_token, session
):
    await _set_tolerancia(client, admin_token, "100.00")
    prestamo_id, caja = await _prestamo_desembolsado(client, admin_token, session)
    # cuota 1 exigible ~ 21666.67; pago corto por 50 (<= tolerancia 100)
    r = await client.post(
        "/api/v1/pagos",
        json={"prestamo_id": prestamo_id, "monto": "21616.67", "canal": "mostrador",
              "caja_id": caja, "fecha_negocio": date.today().isoformat()},
        headers={**_h(admin_token), "Idempotency-Key": "pago-tol-ok"},
    )
    assert r.status_code == 201, r.text
    res = await session.execute(
        text("SELECT estado FROM cuota WHERE prestamo_id=:p AND numero=1"),
        {"p": prestamo_id},
    )
    assert res.scalar_one() == "tolerada"


async def test_pago_fuera_de_tolerancia_queda_parcial(client, admin_token, session):
    await _set_tolerancia(client, admin_token, "100.00")
    prestamo_id, caja = await _prestamo_desembolsado(client, admin_token, session)
    # pago corto por 5000 (> tolerancia) -> parcial
    r = await client.post(
        "/api/v1/pagos",
        json={"prestamo_id": prestamo_id, "monto": "16666.67", "canal": "mostrador",
              "caja_id": caja, "fecha_negocio": date.today().isoformat()},
        headers={**_h(admin_token), "Idempotency-Key": "pago-tol-no"},
    )
    assert r.status_code == 201, r.text
    res = await session.execute(
        text("SELECT estado FROM cuota WHERE prestamo_id=:p AND numero=1"),
        {"p": prestamo_id},
    )
    assert res.scalar_one() == "parcial"
