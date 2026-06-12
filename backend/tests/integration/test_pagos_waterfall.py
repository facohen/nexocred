from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import text

from tests.integration.test_desembolso import _crear_caja, _solicitud_aprobada


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _prestamo_desembolsado(
    client, token, session, cuotas=6, fpc_offset=-30,
    persona=None, cuil=None, dni=None,
):
    """Desembolsa un prestamo con primera cuota ya vencida (fpc_offset dias)."""
    sid = await _solicitud_aprobada(
        client, token, cuotas=cuotas, persona=persona, cuil=cuil, dni=dni
    )
    caja = await _crear_caja(client, token)
    fneg = date.today()
    fpc = (fneg + timedelta(days=fpc_offset)).isoformat()
    r = await client.post(
        f"/api/v1/solicitudes/{sid}/desembolsar",
        json={"caja_id": caja, "fecha_negocio": fneg.isoformat(),
              "fecha_primera_cuota": fpc, "tasa_punitorio_diario": "0"},
        headers={**_h(token), "Idempotency-Key": f"des-{sid}"},
    )
    assert r.status_code == 201, r.text
    return r.json()["prestamo_id"], caja


async def test_pago_reconcilia_imputaciones_y_caja(client, admin_token, session):
    prestamo_id, caja = await _prestamo_desembolsado(client, admin_token, session)
    # cronograma: capital 100000 + interes 30000 = 130000 / 6 cuotas
    r = await client.post(
        "/api/v1/pagos",
        json={"prestamo_id": prestamo_id, "monto": "21666.67", "canal": "mostrador",
              "caja_id": caja, "fecha_negocio": date.today().isoformat()},
        headers={**_h(admin_token), "Idempotency-Key": "pago-1"},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    pago_id = body["id"]

    # reconciliacion: sum(imputaciones no-excedente) + excedente == monto
    res = await session.execute(
        text(
            "SELECT coalesce(sum(monto),0) FROM imputacion "
            "WHERE pago_id=:p AND concepto<>'excedente'"
        ),
        {"p": pago_id},
    )
    imputado = res.scalar_one()
    res = await session.execute(
        text("SELECT excedente, monto FROM pago WHERE id=:p"), {"p": pago_id}
    )
    excedente, monto = res.one()
    assert imputado + excedente == monto == Decimal("21666.67")

    # movimiento de caja ingreso == monto, vinculado al pago
    res = await session.execute(
        text("SELECT monto, tipo FROM movimiento_caja WHERE pago_id=:p"), {"p": pago_id}
    )
    mc_monto, mc_tipo = res.one()
    assert mc_monto == Decimal("21666.67")
    assert mc_tipo == "ingreso"


async def test_pago_exacto_cierra_cuota(client, admin_token, session):
    prestamo_id, caja = await _prestamo_desembolsado(client, admin_token, session)
    # primera cuota exigible (vencida) = 130000/6 ~ 21666.67. pago exacto.
    r = await client.post(
        "/api/v1/pagos",
        json={"prestamo_id": prestamo_id, "monto": "21666.67", "canal": "mostrador",
              "caja_id": caja, "fecha_negocio": date.today().isoformat()},
        headers={**_h(admin_token), "Idempotency-Key": "pago-exacto"},
    )
    assert r.status_code == 201, r.text
    res = await session.execute(
        text("SELECT estado FROM cuota WHERE prestamo_id=:p AND numero=1"),
        {"p": prestamo_id},
    )
    assert res.scalar_one() == "pagada"


async def test_pago_mayor_genera_excedente(client, admin_token, session):
    prestamo_id, caja = await _prestamo_desembolsado(
        client, admin_token, session, cuotas=6, fpc_offset=30
    )
    # nada vencido -> pago normal queda como excedente
    r = await client.post(
        "/api/v1/pagos",
        json={"prestamo_id": prestamo_id, "monto": "5000.00", "canal": "mostrador",
              "caja_id": caja, "fecha_negocio": date.today().isoformat()},
        headers={**_h(admin_token), "Idempotency-Key": "pago-exc"},
    )
    assert r.status_code == 201, r.text
    assert r.json()["excedente"] == "5000.00"


async def test_pago_detalle_desglosa_imputaciones(client, admin_token, session):
    prestamo_id, caja = await _prestamo_desembolsado(client, admin_token, session)
    r = await client.post(
        "/api/v1/pagos",
        json={"prestamo_id": prestamo_id, "monto": "10000.00", "canal": "mostrador",
              "caja_id": caja, "fecha_negocio": date.today().isoformat()},
        headers={**_h(admin_token), "Idempotency-Key": "pago-desglose"},
    )
    pago_id = r.json()["id"]
    r = await client.get(f"/api/v1/pagos/{pago_id}", headers=_h(admin_token))
    assert r.status_code == 200, r.text
    body = r.json()
    assert "imputaciones" in body
    assert len(body["imputaciones"]) >= 1
    for imp in body["imputaciones"]:
        assert "concepto" in imp and "monto" in imp and "orden_waterfall" in imp


async def test_pago_monto_negativo_rechazado(client, admin_token, session):
    prestamo_id, caja = await _prestamo_desembolsado(client, admin_token, session)
    r = await client.post(
        "/api/v1/pagos",
        json={"prestamo_id": prestamo_id, "monto": "-100.00", "canal": "mostrador",
              "caja_id": caja, "fecha_negocio": date.today().isoformat()},
        headers={**_h(admin_token), "Idempotency-Key": "pago-neg"},
    )
    assert r.status_code in (400, 422), r.text
