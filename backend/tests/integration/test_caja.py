from datetime import date
from decimal import Decimal

from sqlalchemy import text


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _caja(client, token, nombre) -> str:
    r = await client.post(
        "/api/v1/cajas", json={"nombre": nombre, "tipo": "efectivo"}, headers=_h(token)
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def test_crear_y_listar_cajas(client, admin_token):
    cid = await _caja(client, admin_token, "Central")
    r = await client.get("/api/v1/cajas", headers=_h(admin_token))
    assert r.status_code == 200
    assert cid in [c["id"] for c in r.json()]


async def test_movimiento_manual_actualiza_saldo(client, admin_token, session):
    cid = await _caja(client, admin_token, "Mov")
    r = await client.post(
        f"/api/v1/cajas/{cid}/movimientos",
        json={"tipo": "ingreso", "monto": "1000.00",
              "fecha_negocio": date.today().isoformat(), "categoria": "aporte"},
        headers=_h(admin_token),
    )
    assert r.status_code == 201, r.text
    await client.post(
        f"/api/v1/cajas/{cid}/movimientos",
        json={"tipo": "egreso", "monto": "300.00",
              "fecha_negocio": date.today().isoformat(), "categoria": "gasto"},
        headers=_h(admin_token),
    )
    r = await client.get("/api/v1/cajas", headers=_h(admin_token))
    caja = next(c for c in r.json() if c["id"] == cid)
    assert caja["saldo_teorico"] == "700.00"

    # ledger sum == saldo_teorico
    res = await session.execute(
        text(
            "SELECT coalesce(sum(CASE WHEN tipo='ingreso' THEN monto ELSE -monto END),0) "
            "FROM movimiento_caja WHERE caja_id=:c"
        ),
        {"c": cid},
    )
    assert res.scalar_one() == Decimal("700.00")


async def test_listar_movimientos_filtro_fecha(client, admin_token):
    cid = await _caja(client, admin_token, "Ledger")
    await client.post(
        f"/api/v1/cajas/{cid}/movimientos",
        json={"tipo": "ingreso", "monto": "500.00",
              "fecha_negocio": date.today().isoformat()},
        headers=_h(admin_token),
    )
    r = await client.get(
        f"/api/v1/cajas/{cid}/movimientos",
        params={"desde": date.today().isoformat(), "hasta": date.today().isoformat()},
        headers=_h(admin_token),
    )
    assert r.status_code == 200, r.text
    assert len(r.json()) == 1


async def test_transferencia_interna_suma_cero(client, admin_token, session):
    origen = await _caja(client, admin_token, "Origen")
    destino = await _caja(client, admin_token, "Destino")
    await client.post(
        f"/api/v1/cajas/{origen}/movimientos",
        json={"tipo": "ingreso", "monto": "1000.00",
              "fecha_negocio": date.today().isoformat()},
        headers=_h(admin_token),
    )
    r = await client.post(
        "/api/v1/transferencias-internas",
        json={"caja_origen_id": origen, "caja_destino_id": destino,
              "monto": "400.00", "fecha_negocio": date.today().isoformat()},
        headers=_h(admin_token),
    )
    assert r.status_code == 201, r.text
    movs = r.json()
    assert len(movs) == 2
    # los dos movimientos suman cero (un egreso y un ingreso del mismo monto)
    signo = sum(
        (Decimal(m["monto"]) if m["tipo"] == "ingreso" else -Decimal(m["monto"]))
        for m in movs
    )
    assert signo == Decimal("0")

    r = await client.get("/api/v1/cajas", headers=_h(admin_token))
    saldos = {c["id"]: c["saldo_teorico"] for c in r.json()}
    assert saldos[origen] == "600.00"
    assert saldos[destino] == "400.00"


async def test_movimiento_manual_idempotente(client, admin_token, session):
    """MINOR 5: repetir el mismo movimiento manual con igual Idempotency-Key no
    duplica el movimiento ni el saldo, y devuelve el mismo resultado."""
    cid = await _caja(client, admin_token, "MovIdem")
    headers = {**_h(admin_token), "Idempotency-Key": "mov-idem-1"}
    payload = {"tipo": "ingreso", "monto": "1000.00",
               "fecha_negocio": date.today().isoformat(), "categoria": "aporte"}
    r1 = await client.post(
        f"/api/v1/cajas/{cid}/movimientos", json=payload, headers=headers
    )
    r2 = await client.post(
        f"/api/v1/cajas/{cid}/movimientos", json=payload, headers=headers
    )
    assert r1.status_code == 201 and r2.status_code == 201, r2.text
    assert r1.json()["id"] == r2.json()["id"]
    res = await session.execute(
        text("SELECT count(*) FROM movimiento_caja WHERE caja_id=:c"), {"c": cid}
    )
    assert res.scalar_one() == 1
    r = await client.get("/api/v1/cajas", headers=_h(admin_token))
    caja = next(c for c in r.json() if c["id"] == cid)
    assert caja["saldo_teorico"] == "1000.00"


async def test_transferencia_interna_idempotente(client, admin_token, session):
    """MINOR 5: repetir la misma transferencia con igual Idempotency-Key no genera
    un segundo par de movimientos y devuelve el mismo resultado."""
    origen = await _caja(client, admin_token, "TIOrigen")
    destino = await _caja(client, admin_token, "TIDestino")
    await client.post(
        f"/api/v1/cajas/{origen}/movimientos",
        json={"tipo": "ingreso", "monto": "1000.00",
              "fecha_negocio": date.today().isoformat()},
        headers=_h(admin_token),
    )
    headers = {**_h(admin_token), "Idempotency-Key": "transf-idem-1"}
    payload = {"caja_origen_id": origen, "caja_destino_id": destino,
               "monto": "400.00", "fecha_negocio": date.today().isoformat()}
    r1 = await client.post(
        "/api/v1/transferencias-internas", json=payload, headers=headers
    )
    r2 = await client.post(
        "/api/v1/transferencias-internas", json=payload, headers=headers
    )
    assert r1.status_code == 201 and r2.status_code == 201, r2.text
    assert [m["id"] for m in r1.json()] == [m["id"] for m in r2.json()]
    res = await session.execute(
        text(
            "SELECT count(*) FROM movimiento_caja "
            "WHERE caja_id IN (:o, :d) AND categoria='transferencia'"
        ),
        {"o": origen, "d": destino},
    )
    assert res.scalar_one() == 2
    r = await client.get("/api/v1/cajas", headers=_h(admin_token))
    saldos = {c["id"]: c["saldo_teorico"] for c in r.json()}
    assert saldos[origen] == "600.00"
    assert saldos[destino] == "400.00"


async def test_arqueo_pendiente_y_cierre(client, admin_token, session):
    cid = await _caja(client, admin_token, "Arqueo")
    await client.post(
        f"/api/v1/cajas/{cid}/movimientos",
        json={"tipo": "ingreso", "monto": "1000.00",
              "fecha_negocio": date.today().isoformat()},
        headers=_h(admin_token),
    )
    r = await client.get(
        f"/api/v1/cajas/{cid}/arqueo-pendiente",
        params={"fecha_negocio": date.today().isoformat()},
        headers=_h(admin_token),
    )
    assert r.status_code == 200, r.text
    assert r.json()["cerrado"] is False
    assert r.json()["saldo_teorico"] == "1000.00"

    r = await client.post(
        f"/api/v1/cajas/{cid}/arqueo",
        json={"fecha_negocio": date.today().isoformat(), "saldo_fisico": "950.00"},
        headers=_h(admin_token),
    )
    assert r.status_code == 201, r.text
    assert r.json()["diferencia"] == "-50.00"

    # no se reabre
    r = await client.post(
        f"/api/v1/cajas/{cid}/arqueo",
        json={"fecha_negocio": date.today().isoformat(), "saldo_fisico": "950.00"},
        headers=_h(admin_token),
    )
    assert r.status_code == 409, r.text
    assert r.json()["error"]["code"] == "arqueo_ya_cerrado"


async def test_posicion_consolidada(client, admin_token):
    c1 = await _caja(client, admin_token, "C1")
    c2 = await _caja(client, admin_token, "C2")
    for cid, monto in ((c1, "100.00"), (c2, "250.00")):
        await client.post(
            f"/api/v1/cajas/{cid}/movimientos",
            json={"tipo": "ingreso", "monto": monto,
                  "fecha_negocio": date.today().isoformat()},
            headers=_h(admin_token),
        )
    r = await client.get(
        "/api/v1/cajas/posicion-consolidada", headers=_h(admin_token)
    )
    assert r.status_code == 200, r.text
    assert r.json()["total"] == "350.00"
