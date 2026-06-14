from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import text

from tests.integration.test_pagos_waterfall import _h, _prestamo_desembolsado


async def _saldo_caja(client, token, caja_id) -> Decimal:
    r = await client.get("/api/v1/cajas", headers=_h(token))
    caja = next(c for c in r.json()["data"] if c["id"] == caja_id)
    return Decimal(caja["saldo_teorico"])


async def test_refinanciar_1a1(client, admin_token, session):
    prestamo_id, caja = await _prestamo_desembolsado(client, admin_token, session)
    fpc = (date.today() + timedelta(days=30)).isoformat()
    r = await client.post(
        "/api/v1/novaciones/refinanciar",
        json={"prestamo_id": prestamo_id, "caja_id": caja,
              "fecha_negocio": date.today().isoformat(),
              "tasa_interes_directo": "0.20", "cantidad_cuotas": 12,
              "fecha_primera_cuota": fpc},
        headers={**_h(admin_token), "Idempotency-Key": "refi-1"},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["tipo"] == "refinanciacion"
    assert body["estado"] == "confirmada"
    nuevo = body["nuevo_prestamo_id"]
    assert nuevo != prestamo_id

    # origen novado
    res = await session.execute(
        text("SELECT estado FROM prestamo WHERE id=:p"), {"p": prestamo_id}
    )
    assert res.scalar_one() == "novado"
    # nuevo prestamo vigente con 12 cuotas
    res = await session.execute(
        text("SELECT count(*) FROM cuota WHERE prestamo_id=:p"), {"p": nuevo}
    )
    assert res.scalar_one() == 12


async def test_refinanciar_es_rollover_puro_sin_movimiento_caja(
    client, admin_token, session
):
    """MAJOR 3 (review): refinanciar no mueve efectivo -> no crea movimiento de caja."""
    prestamo_id, caja = await _prestamo_desembolsado(client, admin_token, session)
    fpc = (date.today() + timedelta(days=30)).isoformat()
    saldo_antes = await _saldo_caja(client, admin_token, caja)
    movs_antes = (
        await session.execute(
            text("SELECT count(*) FROM movimiento_caja WHERE caja_id=:c"), {"c": caja}
        )
    ).scalar_one()
    r = await client.post(
        "/api/v1/novaciones/refinanciar",
        json={"prestamo_id": prestamo_id, "caja_id": caja,
              "fecha_negocio": date.today().isoformat(),
              "tasa_interes_directo": "0.20", "cantidad_cuotas": 6,
              "fecha_primera_cuota": fpc},
        headers={**_h(admin_token), "Idempotency-Key": "refi-norolls"},
    )
    assert r.status_code == 201, r.text
    movs_despues = (
        await session.execute(
            text("SELECT count(*) FROM movimiento_caja WHERE caja_id=:c"), {"c": caja}
        )
    ).scalar_one()
    assert movs_despues == movs_antes
    assert await _saldo_caja(client, admin_token, caja) == saldo_antes


async def test_refinanciar_idempotente(client, admin_token, session):
    prestamo_id, caja = await _prestamo_desembolsado(client, admin_token, session)
    fpc = (date.today() + timedelta(days=30)).isoformat()
    headers = {**_h(admin_token), "Idempotency-Key": "refi-idem"}
    payload = {"prestamo_id": prestamo_id, "caja_id": caja,
               "fecha_negocio": date.today().isoformat(),
               "tasa_interes_directo": "0.20", "cantidad_cuotas": 6,
               "fecha_primera_cuota": fpc}
    r1 = await client.post("/api/v1/novaciones/refinanciar", json=payload, headers=headers)
    r2 = await client.post("/api/v1/novaciones/refinanciar", json=payload, headers=headers)
    assert r1.status_code == 201 and r2.status_code == 201
    assert r1.json()["id"] == r2.json()["id"]
    res = await session.execute(
        text("SELECT count(*) FROM novacion WHERE id=:n"), {"n": r1.json()["id"]}
    )
    assert res.scalar_one() == 1
    # solo un nuevo prestamo
    res = await session.execute(
        text("SELECT count(*) FROM novacion_origen WHERE prestamo_id=:p"),
        {"p": prestamo_id},
    )
    assert res.scalar_one() == 1


async def test_consolidar_Na1(client, admin_token, session):
    from tests.api.test_solicitudes import crear_persona

    persona = await crear_persona(client, admin_token)
    p1, caja = await _prestamo_desembolsado(client, admin_token, session, persona=persona)
    p2, _ = await _prestamo_desembolsado(client, admin_token, session, persona=persona)
    fpc = (date.today() + timedelta(days=30)).isoformat()
    r = await client.post(
        "/api/v1/novaciones/consolidar",
        json={"prestamo_ids": [p1, p2], "caja_id": caja,
              "fecha_negocio": date.today().isoformat(),
              "tasa_interes_directo": "0.25", "cantidad_cuotas": 12,
              "fecha_primera_cuota": fpc},
        headers={**_h(admin_token), "Idempotency-Key": "cons-1"},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["tipo"] == "consolidacion"
    for p in (p1, p2):
        res = await session.execute(
            text("SELECT estado FROM prestamo WHERE id=:p"), {"p": p}
        )
        assert res.scalar_one() == "novado"
    # dos origenes
    res = await session.execute(
        text("SELECT count(*) FROM novacion_origen WHERE novacion_id=:n"),
        {"n": body["id"]},
    )
    assert res.scalar_one() == 2


async def test_transferir_nuevo_deudor(client, admin_token, session):
    prestamo_id, caja = await _prestamo_desembolsado(client, admin_token, session)
    # crear nuevo deudor
    from tests.api.test_solicitudes import crear_persona

    nuevo_deudor = await crear_persona(
        client, admin_token, cuil="27999888777", dni="99988877"
    )
    fpc = (date.today() + timedelta(days=30)).isoformat()
    r = await client.post(
        "/api/v1/novaciones/transferir",
        json={"prestamo_id": prestamo_id, "nuevo_deudor_id": nuevo_deudor,
              "caja_id": caja, "fecha_negocio": date.today().isoformat(),
              "cantidad_cuotas": 6, "fecha_primera_cuota": fpc},
        headers={**_h(admin_token), "Idempotency-Key": "transf-1"},
    )
    assert r.status_code == 201, r.text
    nuevo = r.json()["nuevo_prestamo_id"]
    res = await session.execute(
        text("SELECT persona_id FROM prestamo WHERE id=:p"), {"p": nuevo}
    )
    assert str(res.scalar_one()) == nuevo_deudor


async def test_repactar_rapido(client, admin_token, session):
    prestamo_id, caja = await _prestamo_desembolsado(client, admin_token, session)
    fpc = (date.today() + timedelta(days=30)).isoformat()
    r = await client.post(
        "/api/v1/novaciones/repactar-rapido",
        json={"prestamo_id": prestamo_id, "caja_id": caja,
              "fecha_negocio": date.today().isoformat(),
              "pago_cuenta": "10000.00", "nueva_cuota": "5000.00",
              "periodicidad": "mensual", "tasa_interes_directo": "0.20",
              "fecha_primera_cuota": fpc},
        headers={**_h(admin_token), "Idempotency-Key": "repac-1"},
    )
    assert r.status_code == 201, r.text
    assert r.json()["tipo"] == "repactar_rapido"


async def test_repactar_rapido_registra_pago_cuenta_en_caja(
    client, admin_token, session
):
    """MAJOR 3: el pago a cuenta que entrega el deudor debe quedar registrado como
    INGRESO de caja -> conservacion de dinero."""
    from decimal import Decimal as D

    prestamo_id, caja = await _prestamo_desembolsado(client, admin_token, session)
    fpc = (date.today() + timedelta(days=30)).isoformat()
    saldo_antes = await _saldo_caja(client, admin_token, caja)

    r = await client.post(
        "/api/v1/novaciones/repactar-rapido",
        json={"prestamo_id": prestamo_id, "caja_id": caja,
              "fecha_negocio": date.today().isoformat(),
              "pago_cuenta": "10000.00", "nueva_cuota": "5000.00",
              "periodicidad": "mensual", "tasa_interes_directo": "0.20",
              "fecha_primera_cuota": fpc},
        headers={**_h(admin_token), "Idempotency-Key": "repac-cash"},
    )
    assert r.status_code == 201, r.text
    nuevo = r.json()["nuevo_prestamo_id"]

    # existe un movimiento de caja de 10000.00 por el pago a cuenta
    res = await session.execute(
        text(
            "SELECT count(*) FROM movimiento_caja "
            "WHERE caja_id=:c AND tipo='ingreso' AND monto=:m"
        ),
        {"c": caja, "m": D("10000.00")},
    )
    assert res.scalar_one() == 1

    # el saldo de la caja aumento exactamente en 10000.00
    saldo_despues = await _saldo_caja(client, admin_token, caja)
    assert saldo_despues - saldo_antes == D("10000.00")

    # capital del nuevo prestamo == payoff (130000) - pago_cuenta (10000) == 120000
    res = await session.execute(
        text("SELECT capital FROM prestamo WHERE id=:p"), {"p": nuevo}
    )
    assert res.scalar_one() == D("120000.00")


async def test_repactar_rapido_capital_cuantizado(client, admin_token, session):
    """MINOR 6: el capital persistido del nuevo prestamo es estrictamente 2 decimales."""
    from decimal import Decimal as D

    prestamo_id, caja = await _prestamo_desembolsado(client, admin_token, session)
    fpc = (date.today() + timedelta(days=30)).isoformat()
    r = await client.post(
        "/api/v1/novaciones/repactar-rapido",
        json={"prestamo_id": prestamo_id, "caja_id": caja,
              "fecha_negocio": date.today().isoformat(),
              "pago_cuenta": "10000.33", "nueva_cuota": "5000.00",
              "periodicidad": "mensual", "tasa_interes_directo": "0.20",
              "fecha_primera_cuota": fpc},
        headers={**_h(admin_token), "Idempotency-Key": "repac-quant"},
    )
    assert r.status_code == 201, r.text
    nuevo = r.json()["nuevo_prestamo_id"]
    res = await session.execute(
        text("SELECT capital FROM prestamo WHERE id=:p"), {"p": nuevo}
    )
    capital = res.scalar_one()
    assert capital == capital.quantize(D("0.01"))
    # payoff 130000 - 10000.33 = 119999.67 (ya cuantizado)
    assert capital == D("119999.67")


async def test_detalle_y_cadena(client, admin_token, session):
    prestamo_id, caja = await _prestamo_desembolsado(client, admin_token, session)
    fpc = (date.today() + timedelta(days=30)).isoformat()
    r = await client.post(
        "/api/v1/novaciones/refinanciar",
        json={"prestamo_id": prestamo_id, "caja_id": caja,
              "fecha_negocio": date.today().isoformat(),
              "tasa_interes_directo": "0.20", "cantidad_cuotas": 6,
              "fecha_primera_cuota": fpc},
        headers={**_h(admin_token), "Idempotency-Key": "chain-1"},
    )
    nov_id = r.json()["id"]
    nuevo = r.json()["nuevo_prestamo_id"]

    r = await client.get(f"/api/v1/novaciones/{nov_id}", headers=_h(admin_token))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["nuevo_prestamo_id"] == nuevo
    assert prestamo_id in body["origenes"]

    r = await client.get(
        f"/api/v1/prestamos/{prestamo_id}/novaciones", headers=_h(admin_token)
    )
    assert r.status_code == 200, r.text
    assert nov_id in [n["id"] for n in r.json()]
