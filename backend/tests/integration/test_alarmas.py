from sqlalchemy import text

from tests.integration._helpers_f1c import cuil_valido, relajar_bcra
from tests.integration.test_pagos_waterfall import _prestamo_desembolsado


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _crear_operador(client, admin_token, email="op_al@nexo.test"):
    r = await client.post(
        "/api/v1/usuarios",
        json={"email": email, "nombre": "Operador", "password": "secreto123",
              "roles": ["operador"]},
        headers=_h(admin_token),
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def test_motor_crea_alerta_idempotente(client, admin_token, session):
    await relajar_bcra(client, admin_token)
    # prestamo con mora > 90 dias
    await _prestamo_desembolsado(
        client, admin_token, session, fpc_offset=-120,
        cuil=cuil_valido("82000011"), dni="82000011",
    )
    r1 = await client.post("/api/v1/alertas/procesar", headers=_h(admin_token))
    assert r1.status_code == 200, r1.text
    assert r1.json()["creadas"] >= 1

    # segunda corrida: no duplica alerta activa para el mismo prestamo+metrica
    r2 = await client.post("/api/v1/alertas/procesar", headers=_h(admin_token))
    assert r2.status_code == 200, r2.text
    assert r2.json()["creadas"] == 0
    assert r2.json()["existentes"] >= 1

    res = await session.execute(
        text("SELECT count(*) FROM alerta WHERE estado='activa' AND metrica='mora_90'")
    )
    assert res.scalar_one() == 1


async def test_asignar_alerta_crea_una_tarea(client, admin_token, session):
    await relajar_bcra(client, admin_token)
    await _prestamo_desembolsado(
        client, admin_token, session, fpc_offset=-120,
        cuil=cuil_valido("82000022"), dni="82000022",
    )
    await client.post("/api/v1/alertas/procesar", headers=_h(admin_token))
    lst = await client.get("/api/v1/alertas?estado=activa", headers=_h(admin_token))
    alerta_id = lst.json()[0]["id"]

    op_id = await _crear_operador(client, admin_token)
    r = await client.patch(
        f"/api/v1/alertas/{alerta_id}/asignar",
        json={"operador_id": op_id},
        headers=_h(admin_token),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["operador_id"] == op_id
    assert body["tarea_id"] is not None

    # exactamente UNA tarea CRM vinculada a la alerta
    res = await session.execute(
        text("SELECT count(*) FROM tarea WHERE alerta_id=:a"), {"a": alerta_id}
    )
    assert res.scalar_one() == 1
    res = await session.execute(
        text("SELECT origen, operador_id FROM tarea WHERE id=:t"),
        {"t": body["tarea_id"]},
    )
    origen, op = res.one()
    assert origen == "alerta"
    assert str(op) == op_id


async def test_resolver_alerta(client, admin_token, session):
    await relajar_bcra(client, admin_token)
    await _prestamo_desembolsado(
        client, admin_token, session, fpc_offset=-120,
        cuil=cuil_valido("82000033"), dni="82000033",
    )
    await client.post("/api/v1/alertas/procesar", headers=_h(admin_token))
    lst = await client.get("/api/v1/alertas?estado=activa", headers=_h(admin_token))
    alerta_id = lst.json()[0]["id"]

    r = await client.patch(
        f"/api/v1/alertas/{alerta_id}/resolver",
        json={"justificacion": "cliente regularizo"},
        headers=_h(admin_token),
    )
    assert r.status_code == 200, r.text
    assert r.json()["estado"] == "resuelta"
    assert r.json()["justificacion"] == "cliente regularizo"
