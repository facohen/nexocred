import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import text

from tests.integration._helpers_f1c import cuil_valido, relajar_bcra
from tests.integration.test_pagos_waterfall import _prestamo_desembolsado


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _cobrador_id(session) -> str:
    res = await session.execute(text("SELECT id FROM usuario LIMIT 1"))
    return str(res.scalar_one())


async def _ruta_vacia(client, token, session):
    cobrador = await _cobrador_id(session)
    r = await client.post(
        "/api/v1/rutas",
        json={"cobrador_id": cobrador, "fecha": date.today().isoformat()},
        headers=_h(token),
    )
    return r.json()["id"]


def _batch(prestamo, caja_unused, parada_id, pago_id, monto="2200.00"):
    return {
        "paradas": [
            {
                "id": parada_id,
                "prestamo_id": prestamo,
                "orden": 1,
                "resultado": "pago",
                "monto_cobrado": monto,
                "lat": "-34.6037",
                "lng": "-58.3816",
                "visitada_en": datetime.now(UTC).isoformat(),
                "pago_id": pago_id,
            }
        ]
    }


async def test_sync_aplica_pago_una_vez_y_es_idempotente(client, admin_token, session):
    await relajar_bcra(client, admin_token)
    prestamo, caja = await _prestamo_desembolsado(
        client, admin_token, session, fpc_offset=-30,
        cuil=cuil_valido("77777777"), dni="77777777",
    )
    ruta_id = await _ruta_vacia(client, admin_token, session)
    parada_id = str(uuid.uuid4())
    pago_id = str(uuid.uuid4())
    batch = _batch(prestamo, caja, parada_id, pago_id)
    batch["caja_id"] = caja

    # primer sync: crea parada y aplica pago
    r1 = await client.post(
        f"/api/v1/rutas/{ruta_id}/sync", json=batch, headers=_h(admin_token)
    )
    assert r1.status_code == 200, r1.text
    assert r1.json()["aplicadas"] == 1
    assert r1.json()["items"][0]["pago_id"] == pago_id

    # segundo sync identico: NO duplica nada
    r2 = await client.post(
        f"/api/v1/rutas/{ruta_id}/sync", json=batch, headers=_h(admin_token)
    )
    assert r2.status_code == 200, r2.text
    assert r2.json()["omitidas"] == 1
    assert r2.json()["aplicadas"] == 0

    # exactamente 1 parada, 1 pago, 1 movimiento de caja del cobro
    res = await session.execute(
        text("SELECT count(*) FROM parada_ruta WHERE id=:p"), {"p": parada_id}
    )
    assert res.scalar_one() == 1
    res = await session.execute(
        text("SELECT count(*) FROM pago WHERE id=:p"), {"p": pago_id}
    )
    assert res.scalar_one() == 1
    res = await session.execute(
        text("SELECT count(*) FROM movimiento_caja WHERE pago_id=:p"), {"p": pago_id}
    )
    assert res.scalar_one() == 1

    # reconciliacion: sum(imputaciones no-excedente) + excedente == monto del pago
    res = await session.execute(
        text("SELECT coalesce(sum(monto),0) FROM imputacion "
             "WHERE pago_id=:p AND concepto<>'excedente'"),
        {"p": pago_id},
    )
    imputado = res.scalar_one()
    res = await session.execute(
        text("SELECT excedente, monto FROM pago WHERE id=:p"), {"p": pago_id}
    )
    excedente, monto = res.one()
    assert imputado + excedente == monto == Decimal("2200.00")


async def test_sync_agrega_solo_nueva_parada(client, admin_token, session):
    await relajar_bcra(client, admin_token)
    prestamo, caja = await _prestamo_desembolsado(
        client, admin_token, session, fpc_offset=-30,
        cuil=cuil_valido("88888888"), dni="88888888",
    )
    ruta_id = await _ruta_vacia(client, admin_token, session)
    parada1 = str(uuid.uuid4())
    pago1 = str(uuid.uuid4())
    b1 = _batch(prestamo, caja, parada1, pago1)
    b1["caja_id"] = caja
    await client.post(f"/api/v1/rutas/{ruta_id}/sync", json=b1, headers=_h(admin_token))

    parada2 = str(uuid.uuid4())
    pago2 = str(uuid.uuid4())
    b2 = {
        "caja_id": caja,
        "paradas": [
            b1["paradas"][0],  # repetida -> omitida
            {**b1["paradas"][0], "id": parada2, "pago_id": pago2,
             "orden": 2, "monto_cobrado": "1000.00"},
        ],
    }
    r2 = await client.post(
        f"/api/v1/rutas/{ruta_id}/sync", json=b2, headers=_h(admin_token)
    )
    assert r2.status_code == 200, r2.text
    assert r2.json()["aplicadas"] == 1
    assert r2.json()["omitidas"] == 1

    res = await session.execute(
        text("SELECT count(*) FROM parada_ruta WHERE id IN (:a,:b)"),
        {"a": parada1, "b": parada2},
    )
    assert res.scalar_one() == 2
    res = await session.execute(
        text("SELECT count(*) FROM pago WHERE id IN (:a,:b)"),
        {"a": pago1, "b": pago2},
    )
    assert res.scalar_one() == 2


def _item(prestamo, parada_id, *, resultado, monto=None, pago_id=None, orden=1):
    item = {
        "id": parada_id,
        "prestamo_id": prestamo,
        "orden": orden,
        "resultado": resultado,
        "lat": "-34.6037",
        "lng": "-58.3816",
        "visitada_en": datetime.now(UTC).isoformat(),
    }
    if monto is not None:
        item["monto_cobrado"] = monto
    if pago_id is not None:
        item["pago_id"] = pago_id
    return item


async def _counts(session, *, parada=None, prestamo=None):
    out = {}
    if parada is not None:
        r = await session.execute(
            text("SELECT count(*) FROM parada_ruta WHERE id=:p"), {"p": parada}
        )
        out["paradas"] = r.scalar_one()
    if prestamo is not None:
        r = await session.execute(
            text("SELECT count(*) FROM pago WHERE prestamo_id=:p"), {"p": prestamo}
        )
        out["pagos"] = r.scalar_one()
        r = await session.execute(
            text(
                "SELECT count(*) FROM imputacion i JOIN pago pg ON i.pago_id=pg.id "
                "WHERE pg.prestamo_id=:p"
            ),
            {"p": prestamo},
        )
        out["imputaciones"] = r.scalar_one()
        r = await session.execute(
            text(
                "SELECT count(*) FROM movimiento_caja m JOIN pago pg ON m.pago_id=pg.id "
                "WHERE pg.prestamo_id=:p"
            ),
            {"p": prestamo},
        )
        out["movimientos"] = r.scalar_one()
    return out


async def test_replay_batch_identico_no_crea_nada_nuevo(client, admin_token, session):
    await relajar_bcra(client, admin_token)
    prestamo, caja = await _prestamo_desembolsado(
        client, admin_token, session, fpc_offset=-30,
        cuil=cuil_valido("66600011"), dni="66600011",
    )
    ruta_id = await _ruta_vacia(client, admin_token, session)
    parada_id = str(uuid.uuid4())
    pago_id = str(uuid.uuid4())
    batch = _batch(prestamo, caja, parada_id, pago_id)
    batch["caja_id"] = caja

    r1 = await client.post(
        f"/api/v1/rutas/{ruta_id}/sync", json=batch, headers=_h(admin_token)
    )
    assert r1.status_code == 200, r1.text
    before = await _counts(session, parada=parada_id, prestamo=prestamo)

    r2 = await client.post(
        f"/api/v1/rutas/{ruta_id}/sync", json=batch, headers=_h(admin_token)
    )
    assert r2.status_code == 200, r2.text
    after = await _counts(session, parada=parada_id, prestamo=prestamo)
    assert before == after
    assert before == {"paradas": 1, "pagos": 1, "imputaciones": after["imputaciones"],
                      "movimientos": 1}


async def test_ausente_corregido_a_pago_con_nuevo_pago_id_aplica(
    client, admin_token, session
):
    """BLOCKER regression: una visita 'ausente' re-sincronizada como 'pago' con un
    pago_id NUEVO debe aplicar el cobro (en el codigo viejo se omitia y se perdia)."""
    await relajar_bcra(client, admin_token)
    prestamo, caja = await _prestamo_desembolsado(
        client, admin_token, session, fpc_offset=-30,
        cuil=cuil_valido("66600022"), dni="66600022",
    )
    ruta_id = await _ruta_vacia(client, admin_token, session)
    parada_id = str(uuid.uuid4())

    # primer sync: ausente, sin pago
    b1 = {"caja_id": caja,
          "paradas": [_item(prestamo, parada_id, resultado="ausente")]}
    r1 = await client.post(
        f"/api/v1/rutas/{ruta_id}/sync", json=b1, headers=_h(admin_token)
    )
    assert r1.status_code == 200, r1.text
    c1 = await _counts(session, prestamo=prestamo)
    assert c1["pagos"] == 0

    # correccion: misma parada, ahora pago con un pago_id NUEVO
    pago_id = str(uuid.uuid4())
    b2 = {"caja_id": caja,
          "paradas": [_item(prestamo, parada_id, resultado="pago",
                            monto="2200.00", pago_id=pago_id)]}
    r2 = await client.post(
        f"/api/v1/rutas/{ruta_id}/sync", json=b2, headers=_h(admin_token)
    )
    assert r2.status_code == 200, r2.text
    assert r2.json()["items"][0]["estado"] == "aplicada"
    assert r2.json()["items"][0]["pago_id"] == pago_id

    c2 = await _counts(session, prestamo=prestamo)
    assert c2["pagos"] == 1
    assert c2["movimientos"] == 1
    # la parada se actualizo a 'pago'
    res = await session.execute(
        text("SELECT resultado, monto_cobrado FROM parada_ruta WHERE id=:p"),
        {"p": parada_id},
    )
    resultado, monto = res.one()
    assert resultado == "pago"
    assert monto == Decimal("2200.00")


async def test_pago_sin_pago_id_es_rechazado(client, admin_token, session):
    await relajar_bcra(client, admin_token)
    prestamo, caja = await _prestamo_desembolsado(
        client, admin_token, session, fpc_offset=-30,
        cuil=cuil_valido("66600033"), dni="66600033",
    )
    ruta_id = await _ruta_vacia(client, admin_token, session)
    res = await session.execute(
        text("SELECT count(*) FROM pago WHERE prestamo_id=:p"), {"p": prestamo}
    )
    pagos_antes = res.scalar_one()

    parada_id = str(uuid.uuid4())
    b = {"caja_id": caja,
         "paradas": [_item(prestamo, parada_id, resultado="pago", monto="1500.00")]}
    r = await client.post(
        f"/api/v1/rutas/{ruta_id}/sync", json=b, headers=_h(admin_token)
    )
    assert r.status_code == 200, r.text
    assert r.json()["items"][0]["estado"] == "rechazada"
    assert r.json()["aplicadas"] == 0
    # no se registro dinero
    c = await _counts(session, prestamo=prestamo)
    assert c["pagos"] == pagos_antes
    assert c["movimientos"] == 0
    # ni monto en la parada
    res = await session.execute(
        text("SELECT monto_cobrado FROM parada_ruta WHERE id=:p"), {"p": parada_id}
    )
    fila = res.scalar_one_or_none()
    assert fila is None or fila == Decimal("0") or fila is None


async def test_mismo_pago_id_distinto_monto_rechaza_409(
    client, admin_token, session
):
    await relajar_bcra(client, admin_token)
    prestamo, caja = await _prestamo_desembolsado(
        client, admin_token, session, fpc_offset=-30,
        cuil=cuil_valido("66600044"), dni="66600044",
    )
    ruta_id = await _ruta_vacia(client, admin_token, session)
    parada_id = str(uuid.uuid4())
    pago_id = str(uuid.uuid4())
    b1 = {"caja_id": caja,
          "paradas": [_item(prestamo, parada_id, resultado="pago",
                            monto="2200.00", pago_id=pago_id)]}
    r1 = await client.post(
        f"/api/v1/rutas/{ruta_id}/sync", json=b1, headers=_h(admin_token)
    )
    assert r1.status_code == 200, r1.text

    # mismo pago_id, monto distinto -> 409 pago_inmutable
    b2 = {"caja_id": caja,
          "paradas": [_item(prestamo, parada_id, resultado="pago",
                            monto="9999.00", pago_id=pago_id)]}
    r2 = await client.post(
        f"/api/v1/rutas/{ruta_id}/sync", json=b2, headers=_h(admin_token)
    )
    assert r2.status_code == 409, r2.text
    assert r2.json()["error"]["code"] == "pago_inmutable"


async def test_resultado_invalido_rechaza_solo_ese_item(
    client, admin_token, session
):
    await relajar_bcra(client, admin_token)
    prestamo, caja = await _prestamo_desembolsado(
        client, admin_token, session, fpc_offset=-30,
        cuil=cuil_valido("66600055"), dni="66600055",
    )
    ruta_id = await _ruta_vacia(client, admin_token, session)
    mala = str(uuid.uuid4())
    buena = str(uuid.uuid4())
    pago_id = str(uuid.uuid4())
    b = {"caja_id": caja,
         "paradas": [
             _item(prestamo, mala, resultado="explotado", orden=1),
             _item(prestamo, buena, resultado="pago", monto="2200.00",
                   pago_id=pago_id, orden=2),
         ]}
    r = await client.post(
        f"/api/v1/rutas/{ruta_id}/sync", json=b, headers=_h(admin_token)
    )
    assert r.status_code == 200, r.text
    estados = {i["parada_id"]: i["estado"] for i in r.json()["items"]}
    assert estados[mala] == "rechazada"
    assert estados[buena] == "aplicada"
    # la mala no creo parada
    res = await session.execute(
        text("SELECT count(*) FROM parada_ruta WHERE id=:p"), {"p": mala}
    )
    assert res.scalar_one() == 0
