"""E2E F1c: ruta -> visita -> rendicion reconcilia; alerta -> tarea."""

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


async def test_e2e_ruta_visita_rendicion_reconcilia(client, admin_token, session):
    await relajar_bcra(client, admin_token)
    _prestamo, caja = await _prestamo_desembolsado(
        client, admin_token, session, fpc_offset=-30,
        cuil=cuil_valido("90000011"), dni="90000011",
    )
    cobrador = await _cobrador_id(session)
    r = await client.post(
        "/api/v1/rutas",
        json={"cobrador_id": cobrador, "fecha": date.today().isoformat()},
        headers=_h(admin_token),
    )
    ruta_id = r.json()["id"]
    rd = await client.get(f"/api/v1/rutas/{ruta_id}", headers=_h(admin_token))
    parada_id = rd.json()["paradas"][0]["id"]

    await client.post(
        f"/api/v1/rutas/{ruta_id}/paradas/{parada_id}/visitar",
        json={"resultado": "pago", "monto_cobrado": "7000.00", "caja_id": caja,
              "fecha_negocio": date.today().isoformat()},
        headers=_h(admin_token),
    )

    rend = await client.post(
        "/api/v1/rendiciones", json={"ruta_id": ruta_id}, headers=_h(admin_token)
    )
    rid = rend.json()["id"]
    assert rend.json()["total_cobrado"] == "7000.00"

    # descargo aprobado 2000 -> diferencia 5000
    dr = await client.post(
        f"/api/v1/rendiciones/{rid}/descargos",
        json={"concepto": "viaticos", "monto": "2000.00"}, headers=_h(admin_token),
    )
    did = dr.json()["id"]
    await client.patch(
        f"/api/v1/rendiciones/{rid}/descargos/{did}",
        json={"estado": "aprobado"}, headers=_h(admin_token),
    )
    det = await client.get(f"/api/v1/rendiciones/{rid}", headers=_h(admin_token))
    body = det.json()
    # reconcilia: total_cobrado - descargos_aprobados == diferencia
    assert (
        Decimal(body["total_cobrado"]) - Decimal(body["total_descargos"])
        == Decimal(body["diferencia"]) == Decimal("5000.00")
    )

    # y el total cobrado coincide con la suma de pagos de la ruta
    res = await session.execute(
        text("SELECT coalesce(sum(p.monto),0) FROM pago p "
             "JOIN parada_ruta pr ON p.parada_id=pr.id WHERE pr.ruta_id=:r"),
        {"r": ruta_id},
    )
    assert res.scalar_one() == Decimal("7000.00")


async def test_e2e_alerta_asignacion_crea_tarea(client, admin_token, session):
    await relajar_bcra(client, admin_token)
    await _prestamo_desembolsado(
        client, admin_token, session, fpc_offset=-120,
        cuil=cuil_valido("90000022"), dni="90000022",
    )
    await client.post("/api/v1/alertas/procesar", headers=_h(admin_token))
    lst = await client.get("/api/v1/alertas?estado=activa", headers=_h(admin_token))
    alerta_id = lst.json()["data"][0]["id"]

    op = await client.post(
        "/api/v1/usuarios",
        json={"email": "op_e2e@nexo.test", "nombre": "Op", "password": "secreto123",
              "roles": ["operador"]},
        headers=_h(admin_token),
    )
    op_id = op.json()["id"]
    asg = await client.patch(
        f"/api/v1/alertas/{alerta_id}/asignar",
        json={"operador_id": op_id}, headers=_h(admin_token),
    )
    assert asg.json()["tarea_id"] is not None
    res = await session.execute(
        text("SELECT count(*) FROM tarea WHERE alerta_id=:a"), {"a": alerta_id}
    )
    assert res.scalar_one() == 1
