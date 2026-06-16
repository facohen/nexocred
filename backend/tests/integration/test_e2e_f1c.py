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
              "roles": ["administrativo"]},
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


async def test_snapshot_incluye_zona_sector(client, admin_token, session):
    """El snapshot_terminos del préstamo contiene zona y sector tras desembolso,
    cuando el vendedor (admin en tests) tiene asignación vigente."""
    from datetime import date as _date

    await relajar_bcra(client, admin_token)

    r_zona = await client.post(
        "/api/v1/maestros/zonas",
        json={"codigo": "ZONA_E2_SNAP", "nombre": "Zona E2 Snapshot"},
        headers=_h(admin_token),
    )
    assert r_zona.status_code == 201, r_zona.text
    zona_id = r_zona.json()["id"]

    r_sec = await client.get(
        "/api/v1/maestros/sectores?per_page=1", headers=_h(admin_token)
    )
    assert r_sec.status_code == 200
    sector_id = r_sec.json()["data"][0]["id"]

    res = await session.execute(text("SELECT id FROM usuario LIMIT 1"))
    vendedor_id = str(res.scalar_one())

    r_asig = await client.put(
        f"/api/v1/maestros/vendedores/{vendedor_id}/asignacion",
        json={
            "zona_id": zona_id,
            "sector_id": sector_id,
            "vigente_desde": _date.today().isoformat(),
        },
        headers=_h(admin_token),
    )
    assert r_asig.status_code in (200, 201), r_asig.text

    prestamo_id, _caja = await _prestamo_desembolsado(
        client, admin_token, session, fpc_offset=-30,
        cuil=cuil_valido("70000088"), dni="70000088",
    )

    r = await client.get(f"/api/v1/prestamos/{prestamo_id}", headers=_h(admin_token))
    assert r.status_code == 200, r.text
    snap = r.json().get("snapshot_terminos") or {}
    assert "zona" in snap, f"'zona' no está en snapshot: {snap.keys()}"
    assert "sector" in snap, f"'sector' no está en snapshot: {snap.keys()}"
    assert snap["zona"] == zona_id
    assert snap["sector"] == sector_id
