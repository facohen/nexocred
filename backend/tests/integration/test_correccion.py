from datetime import date
from decimal import Decimal

from sqlalchemy import text

from tests.integration.test_pagos_waterfall import _h, _prestamo_desembolsado


async def _pagar(client, token, prestamo_id, caja, monto, key):
    r = await client.post(
        "/api/v1/pagos",
        json={"prestamo_id": prestamo_id, "monto": monto, "canal": "mostrador",
              "caja_id": caja, "fecha_negocio": date.today().isoformat()},
        headers={**_h(token), "Idempotency-Key": key},
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _snapshot_imputaciones(session, pago_id):
    res = await session.execute(
        text(
            "SELECT id, concepto, monto, orden_waterfall, cuota_numero "
            "FROM imputacion WHERE pago_id=:p ORDER BY id"
        ),
        {"p": pago_id},
    )
    return [tuple(r) for r in res.all()]


async def test_correccion_es_append_only_y_balancea(client, admin_token, session):
    prestamo_id, caja = await _prestamo_desembolsado(client, admin_token, session)
    original = await _pagar(client, admin_token, prestamo_id, caja, "10000.00", "p-orig")
    pago_orig_id = original["id"]
    snap_antes = await _snapshot_imputaciones(session, pago_orig_id)
    assert snap_antes  # tiene imputaciones

    r = await client.post(
        f"/api/v1/pagos/{pago_orig_id}/corregir",
        json={"monto": "12000.00", "canal": "mostrador", "caja_id": caja,
              "fecha_negocio": date.today().isoformat(), "motivo": "monto erroneo"},
        headers={**_h(admin_token), "Idempotency-Key": "corr-1"},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["pago_original_id"] == pago_orig_id
    pago_nuevo_id = body["pago_nuevo_id"]
    assert pago_nuevo_id != pago_orig_id

    # original imputaciones byte-for-byte intactas
    snap_despues = await _snapshot_imputaciones(session, pago_orig_id)
    assert snap_despues == snap_antes

    # original marcado corregido
    res = await session.execute(
        text("SELECT estado FROM pago WHERE id=:p"), {"p": pago_orig_id}
    )
    assert res.scalar_one() == "corregido"

    # nuevo pago apunta a corrige_pago_id
    res = await session.execute(
        text("SELECT corrige_pago_id, monto FROM pago WHERE id=:p"),
        {"p": pago_nuevo_id},
    )
    corrige, monto_nuevo = res.one()
    assert str(corrige) == pago_orig_id
    assert monto_nuevo == Decimal("12000.00")

    # contra-asiento de caja: existe un egreso reversando el ingreso original
    res = await session.execute(
        text(
            "SELECT count(*) FROM movimiento_caja "
            "WHERE referencia=:ref AND tipo='egreso' AND categoria='correccion'"
        ),
        {"ref": pago_orig_id},
    )
    assert res.scalar_one() == 1


async def test_correccion_idempotente(client, admin_token, session):
    prestamo_id, caja = await _prestamo_desembolsado(client, admin_token, session)
    original = await _pagar(client, admin_token, prestamo_id, caja, "10000.00", "p-idem")
    pago_orig_id = original["id"]
    headers = {**_h(admin_token), "Idempotency-Key": "corr-idem"}
    payload = {"monto": "12000.00", "canal": "mostrador", "caja_id": caja,
               "fecha_negocio": date.today().isoformat()}
    r1 = await client.post(
        f"/api/v1/pagos/{pago_orig_id}/corregir", json=payload, headers=headers
    )
    assert r1.status_code == 201, r1.text
    r2 = await client.post(
        f"/api/v1/pagos/{pago_orig_id}/corregir", json=payload, headers=headers
    )
    assert r2.status_code == 201, r2.text
    assert r1.json()["pago_nuevo_id"] == r2.json()["pago_nuevo_id"]

    # un solo pago de reemplazo (estado aplicado) y una sola reversa
    res = await session.execute(
        text(
            "SELECT count(*) FROM pago WHERE corrige_pago_id=:o AND estado='aplicado'"
        ),
        {"o": pago_orig_id},
    )
    assert res.scalar_one() == 1
    res = await session.execute(
        text("SELECT count(*) FROM pago WHERE corrige_pago_id=:o AND estado='reversa'"),
        {"o": pago_orig_id},
    )
    assert res.scalar_one() == 1


async def test_correccion_balance_total_cero(client, admin_token, session):
    """sum(imputaciones original) + sum(reversas del contra-asiento) == 0."""
    prestamo_id, caja = await _prestamo_desembolsado(client, admin_token, session)
    original = await _pagar(client, admin_token, prestamo_id, caja, "10000.00", "p-bal")
    pago_orig_id = original["id"]
    res = await session.execute(
        text("SELECT coalesce(sum(monto),0) FROM imputacion WHERE pago_id=:p"),
        {"p": pago_orig_id},
    )
    suma_original = res.scalar_one()

    r = await client.post(
        f"/api/v1/pagos/{pago_orig_id}/corregir",
        json={"monto": "12000.00", "canal": "mostrador", "caja_id": caja,
              "fecha_negocio": date.today().isoformat()},
        headers={**_h(admin_token), "Idempotency-Key": "corr-bal"},
    )
    assert r.status_code == 201, r.text

    # reversas: imputaciones negativas con pago_id del pago de reversa (estado='reversa')
    res = await session.execute(
        text(
            "SELECT coalesce(sum(i.monto),0) FROM imputacion i "
            "JOIN pago p ON i.pago_id=p.id WHERE p.estado='reversa'"
        )
    )
    suma_reversas = res.scalar_one()
    assert suma_original + suma_reversas == Decimal("0")
