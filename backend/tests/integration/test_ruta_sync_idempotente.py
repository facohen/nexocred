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
