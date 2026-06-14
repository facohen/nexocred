"""BUG 2: el endpoint `visitar` de La Ruta debe ser idempotente por pago_id.

Un retry tras timeout (mismo pago_id del dispositivo, o mismo Idempotency-Key) NO
debe registrar el cobro dos veces. Antes `visitar` llamaba a registrar_pago_uow con
idempotency_key=None y sin pago_id, por lo que un reintento duplicaba el cobro.
"""

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import text

from tests.integration._helpers_f1c import cuil_valido, relajar_bcra
from tests.integration.test_pagos_waterfall import _prestamo_desembolsado


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _cobrador_id(session) -> str:
    res = await session.execute(text("SELECT id FROM usuario LIMIT 1"))
    return str(res.scalar_one())


async def _ruta_con_parada(client, token, session, prestamo_id):
    """Genera una ruta (que crea una parada para el prestamo con saldo > 0) y
    devuelve (ruta_id, parada_id)."""
    cobrador = await _cobrador_id(session)
    r = await client.post(
        "/api/v1/rutas",
        json={"cobrador_id": cobrador, "fecha": date.today().isoformat()},
        headers=_h(token),
    )
    assert r.status_code == 201, r.text
    ruta_id = r.json()["id"]
    r = await client.get(
        f"/api/v1/rutas/{ruta_id}/paradas", headers=_h(token)
    )
    assert r.status_code == 200, r.text
    paradas = [p for p in r.json() if p["prestamo_id"] == prestamo_id]
    assert paradas, "la ruta deberia tener una parada para el prestamo desembolsado"
    return ruta_id, paradas[0]["id"]


async def test_visitar_con_pago_id_es_idempotente(client, admin_token, session):
    await relajar_bcra(client, admin_token)
    prestamo, caja = await _prestamo_desembolsado(
        client, admin_token, session, fpc_offset=-30,
        cuil=cuil_valido("55500011"), dni="55500011",
    )
    ruta_id, parada_id = await _ruta_con_parada(client, admin_token, session, prestamo)
    pago_id = str(uuid.uuid4())
    body = {
        "resultado": "pago",
        "monto_cobrado": "2200.00",
        "caja_id": caja,
        "fecha_negocio": date.today().isoformat(),
        "pago_id": pago_id,
    }

    r1 = await client.post(
        f"/api/v1/rutas/{ruta_id}/paradas/{parada_id}/visitar",
        json=body, headers=_h(admin_token),
    )
    assert r1.status_code == 200, r1.text
    assert r1.json()["pago_id"] == pago_id

    # retry tras timeout: mismo pago_id -> NO recobra
    r2 = await client.post(
        f"/api/v1/rutas/{ruta_id}/paradas/{parada_id}/visitar",
        json=body, headers=_h(admin_token),
    )
    assert r2.status_code == 200, r2.text
    assert r2.json()["pago_id"] == pago_id

    # exactamente 1 pago y 1 movimiento de caja
    res = await session.execute(
        text("SELECT count(*) FROM pago WHERE id=:p"), {"p": pago_id}
    )
    assert res.scalar_one() == 1
    res = await session.execute(
        text("SELECT count(*) FROM pago WHERE prestamo_id=:p"), {"p": prestamo}
    )
    assert res.scalar_one() == 1
    res = await session.execute(
        text("SELECT count(*) FROM movimiento_caja WHERE pago_id=:p"), {"p": pago_id}
    )
    assert res.scalar_one() == 1


async def test_visitar_con_idempotency_key_header_dedup(client, admin_token, session):
    await relajar_bcra(client, admin_token)
    prestamo, caja = await _prestamo_desembolsado(
        client, admin_token, session, fpc_offset=-30,
        cuil=cuil_valido("55500022"), dni="55500022",
    )
    ruta_id, parada_id = await _ruta_con_parada(client, admin_token, session, prestamo)
    key = str(uuid.uuid4())
    body = {
        "resultado": "pago",
        "monto_cobrado": "2200.00",
        "caja_id": caja,
        "fecha_negocio": date.today().isoformat(),
    }
    headers = {**_h(admin_token), "Idempotency-Key": key}

    r1 = await client.post(
        f"/api/v1/rutas/{ruta_id}/paradas/{parada_id}/visitar",
        json=body, headers=headers,
    )
    assert r1.status_code == 200, r1.text
    assert r1.json()["pago_id"] == key

    r2 = await client.post(
        f"/api/v1/rutas/{ruta_id}/paradas/{parada_id}/visitar",
        json=body, headers=headers,
    )
    assert r2.status_code == 200, r2.text

    res = await session.execute(
        text("SELECT count(*) FROM pago WHERE prestamo_id=:p"), {"p": prestamo}
    )
    assert res.scalar_one() == 1
    res = await session.execute(
        text("SELECT count(*) FROM movimiento_caja WHERE pago_id=:p"), {"p": key}
    )
    assert res.scalar_one() == 1


async def test_visitar_mismo_pago_id_distinto_monto_rechaza_409(
    client, admin_token, session
):
    await relajar_bcra(client, admin_token)
    prestamo, caja = await _prestamo_desembolsado(
        client, admin_token, session, fpc_offset=-30,
        cuil=cuil_valido("55500033"), dni="55500033",
    )
    ruta_id, parada_id = await _ruta_con_parada(client, admin_token, session, prestamo)
    pago_id = str(uuid.uuid4())
    body = {
        "resultado": "pago",
        "monto_cobrado": "2200.00",
        "caja_id": caja,
        "fecha_negocio": date.today().isoformat(),
        "pago_id": pago_id,
    }
    r1 = await client.post(
        f"/api/v1/rutas/{ruta_id}/paradas/{parada_id}/visitar",
        json=body, headers=_h(admin_token),
    )
    assert r1.status_code == 200, r1.text

    # mismo pago_id, monto distinto -> 409 pago_inmutable
    r2 = await client.post(
        f"/api/v1/rutas/{ruta_id}/paradas/{parada_id}/visitar",
        json={**body, "monto_cobrado": "9999.00"}, headers=_h(admin_token),
    )
    assert r2.status_code == 409, r2.text
    assert r2.json()["error"]["code"] == "pago_inmutable"
    # sigue habiendo un solo pago
    res = await session.execute(
        text("SELECT count(*) FROM pago WHERE prestamo_id=:p"), {"p": prestamo}
    )
    assert res.scalar_one() == 1


async def test_visitar_sin_pago_id_cobra_normal(client, admin_token, session):
    """Sin pago_id ni Idempotency-Key, visitar sigue cobrando (compat hacia atras)."""
    await relajar_bcra(client, admin_token)
    prestamo, caja = await _prestamo_desembolsado(
        client, admin_token, session, fpc_offset=-30,
        cuil=cuil_valido("55500044"), dni="55500044",
    )
    ruta_id, parada_id = await _ruta_con_parada(client, admin_token, session, prestamo)
    r = await client.post(
        f"/api/v1/rutas/{ruta_id}/paradas/{parada_id}/visitar",
        json={"resultado": "pago", "monto_cobrado": "2200.00", "caja_id": caja,
              "fecha_negocio": date.today().isoformat()},
        headers=_h(admin_token),
    )
    assert r.status_code == 200, r.text
    assert r.json()["pago_id"] is not None
    res = await session.execute(
        text("SELECT count(*) FROM pago WHERE prestamo_id=:p"), {"p": prestamo}
    )
    assert res.scalar_one() == 1
    res = await session.execute(
        text("SELECT monto FROM pago WHERE prestamo_id=:p"), {"p": prestamo}
    )
    assert res.scalar_one() == Decimal("2200.00")
