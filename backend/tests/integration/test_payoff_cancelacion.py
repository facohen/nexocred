import contextlib
from datetime import date
from decimal import Decimal

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


async def test_cancelacion_consistente_estado_y_pago(client, admin_token, session):
    """MAJOR 1: tras cancelar, en la misma op logica, estado=='cancelado' Y el pago
    de payoff existe Y son consistentes (un unico commit)."""
    prestamo_id, caja = await _prestamo_desembolsado(client, admin_token, session)
    r = await client.post(
        f"/api/v1/prestamos/{prestamo_id}/cancelar",
        json={"caja_id": caja, "fecha_negocio": date.today().isoformat(),
              "canal": "mostrador"},
        headers={**_h(admin_token), "Idempotency-Key": "cancel-cons"},
    )
    assert r.status_code == 201, r.text
    pago_id = r.json()["id"]

    # estado cancelado
    res = await session.execute(
        text("SELECT estado FROM prestamo WHERE id=:p"), {"p": prestamo_id}
    )
    assert res.scalar_one() == "cancelado"
    # el pago de payoff existe y pertenece al prestamo
    res = await session.execute(
        text("SELECT prestamo_id::text, monto FROM pago WHERE id=:id"), {"id": pago_id}
    )
    fila = res.one()
    assert fila[0] == prestamo_id
    assert fila[1] == Decimal("130000.00")
    # y dejo su movimiento de caja (conservacion de dinero)
    res = await session.execute(
        text("SELECT count(*) FROM movimiento_caja WHERE pago_id=:id"), {"id": pago_id}
    )
    assert res.scalar_one() == 1


async def test_cancelacion_atomica_falla_no_persiste_nada(
    client, admin_token, session, monkeypatch
):
    """MAJOR 1 (regresion): si el camino de actualizacion de estado/auditoria falla,
    NINGUN pago/movimiento de payoff persiste (la operacion es atomica)."""
    prestamo_id, caja = await _prestamo_desembolsado(client, admin_token, session)

    from app.m03_prestamos import servicio as prestamos_srv

    async def _boom(*args, **kwargs):
        raise RuntimeError("fallo inyectado tras el pago de payoff")

    # escribir_evento se invoca despues de registrar el pago y de fijar estado,
    # antes del unico commit -> debe forzar rollback de TODO.
    monkeypatch.setattr(prestamos_srv, "escribir_evento", _boom)

    pagos_antes = (
        await session.execute(
            text("SELECT count(*) FROM pago WHERE prestamo_id=:p"), {"p": prestamo_id}
        )
    ).scalar_one()
    movs_antes = (
        await session.execute(
            text("SELECT count(*) FROM movimiento_caja WHERE caja_id=:c"), {"c": caja}
        )
    ).scalar_one()

    with contextlib.suppress(RuntimeError):
        await client.post(
            f"/api/v1/prestamos/{prestamo_id}/cancelar",
            json={"caja_id": caja, "fecha_negocio": date.today().isoformat(),
                  "canal": "mostrador"},
            headers={**_h(admin_token), "Idempotency-Key": "cancel-atom"},
        )

    # nada quedo persistido: ni pago, ni movimiento, ni cambio de estado
    pagos_despues = (
        await session.execute(
            text("SELECT count(*) FROM pago WHERE prestamo_id=:p"), {"p": prestamo_id}
        )
    ).scalar_one()
    movs_despues = (
        await session.execute(
            text("SELECT count(*) FROM movimiento_caja WHERE caja_id=:c"), {"c": caja}
        )
    ).scalar_one()
    estado = (
        await session.execute(
            text("SELECT estado FROM prestamo WHERE id=:p"), {"p": prestamo_id}
        )
    ).scalar_one()
    assert pagos_despues == pagos_antes
    assert movs_despues == movs_antes
    assert estado != "cancelado"


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
