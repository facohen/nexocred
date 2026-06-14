from datetime import date
from decimal import Decimal

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


async def test_cuota_tolerada_da_de_baja_remanente_saldo_cero(
    client, admin_token, session
):
    """BUG 1: al tolerar, se persiste una imputacion AJUSTE_TOLERANCIA por el faltante
    y el saldo exigible de esa cuota queda en cero (no re-cobra el remanente)."""
    await _set_tolerancia(client, admin_token, "100.00")
    prestamo_id, caja = await _prestamo_desembolsado(client, admin_token, session)
    # cuota 1 exigible = 130000/6 = 21666.67; pago corto por 50 (<= tolerancia 100)
    r = await client.post(
        "/api/v1/pagos",
        json={"prestamo_id": prestamo_id, "monto": "21616.67", "canal": "mostrador",
              "caja_id": caja, "fecha_negocio": date.today().isoformat()},
        headers={**_h(admin_token), "Idempotency-Key": "pago-tol-baja"},
    )
    assert r.status_code == 201, r.text
    pago_id = r.json()["id"]

    # se persistio la baja contable del remanente perdonado (50.00)
    res = await session.execute(
        text(
            "SELECT coalesce(sum(monto),0) FROM imputacion "
            "WHERE pago_id=:p AND concepto='ajuste_tolerancia'"
        ),
        {"p": pago_id},
    )
    assert res.scalar_one() == Decimal("50.00")

    res = await session.execute(
        text("SELECT estado FROM cuota WHERE prestamo_id=:p AND numero=1"),
        {"p": prestamo_id},
    )
    assert res.scalar_one() == "tolerada"


async def test_payoff_no_refactura_remanente_tolerado(client, admin_token, session):
    """BUG 1 (critico): un payoff/cancelacion posterior NO re-factura el remanente
    perdonado por tolerancia."""
    await _set_tolerancia(client, admin_token, "100.00")
    prestamo_id, caja = await _prestamo_desembolsado(client, admin_token, session)
    # tolerar cuota 1: pago corto por 50
    r = await client.post(
        "/api/v1/pagos",
        json={"prestamo_id": prestamo_id, "monto": "21616.67", "canal": "mostrador",
              "caja_id": caja, "fecha_negocio": date.today().isoformat()},
        headers={**_h(admin_token), "Idempotency-Key": "pago-tol-payoff"},
    )
    assert r.status_code == 201, r.text

    # payoff total original = 130000. Ya se cobraron 21616.67 y se perdonaron 50.
    # El payoff restante NO debe incluir esos 50: 130000 - 21616.67 - 50 = 108333.33.
    r = await client.post(
        f"/api/v1/prestamos/{prestamo_id}/cancelar",
        json={"caja_id": caja, "fecha_negocio": date.today().isoformat(),
              "canal": "mostrador"},
        headers={**_h(admin_token), "Idempotency-Key": "cancel-tol"},
    )
    assert r.status_code == 201, r.text
    assert r.json()["monto"] == "108333.33"

    res = await session.execute(
        text("SELECT estado FROM cuota WHERE prestamo_id=:p AND numero=1"),
        {"p": prestamo_id},
    )
    # cuota 1 sigue tolerada (no re-abierta ni re-cobrada)
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
