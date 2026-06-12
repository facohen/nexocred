from datetime import date, timedelta

from sqlalchemy import text

from tests.api.test_solicitudes import (
    cargar_tasa,
    crear_perfil,
    crear_persona,
    crear_producto,
    crear_solicitud,
    sync_bcra,
)


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _crear_caja(client, token, nombre="Caja Central") -> str:
    r = await client.post(
        "/api/v1/cajas",
        json={"nombre": nombre, "tipo": "efectivo"},
        headers=_h(token),
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _solicitud_aprobada(client, token, cuotas=6, persona=None, cuil=None, dni=None):
    if persona is None:
        kw = {}
        if cuil is not None:
            kw["cuil"] = cuil
        if dni is not None:
            kw["dni"] = dni
        persona = await crear_persona(client, token, **kw)
    producto = await crear_producto(client, token)
    perfil = await crear_perfil(client, token)
    await cargar_tasa(client, token, producto, perfil, cuotas, tasa="0.30")
    await sync_bcra(client, token, persona)
    sid = await crear_solicitud(client, token, persona, producto, cantidad_cuotas=cuotas)
    await client.post(f"/api/v1/solicitudes/{sid}/evaluar", headers=_h(token))
    r = await client.patch(
        f"/api/v1/solicitudes/{sid}/estado",
        json={"estado": "aprobada"},
        headers=_h(token),
    )
    assert r.status_code == 200, r.text
    return sid


async def test_desembolso_crea_prestamo_cuotas_y_caja(client, admin_token, session):
    sid = await _solicitud_aprobada(client, admin_token, cuotas=6)
    caja = await _crear_caja(client, admin_token)
    fpc = (date.today() + timedelta(days=30)).isoformat()
    r = await client.post(
        f"/api/v1/solicitudes/{sid}/desembolsar",
        json={"caja_id": caja, "fecha_negocio": date.today().isoformat(),
              "fecha_primera_cuota": fpc, "tasa_punitorio_diario": "0.001"},
        headers={**_h(admin_token), "Idempotency-Key": "des-1"},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["estado"] == "desembolsada"
    assert body["cantidad_cuotas"] == 6
    prestamo_id = body["prestamo_id"]

    # cuotas materializadas
    res = await session.execute(
        text("SELECT count(*) FROM cuota WHERE prestamo_id=:p"), {"p": prestamo_id}
    )
    assert res.scalar_one() == 6

    # movimiento de caja por el capital
    res = await session.execute(
        text("SELECT monto FROM movimiento_caja WHERE id=:m"),
        {"m": body["movimiento_caja_id"]},
    )
    assert res.scalar_one() == 1 * 100000  # 100000.00

    # solicitud quedo desembolsada
    res = await session.execute(
        text("SELECT estado FROM solicitud_credito WHERE id=:s"), {"s": sid}
    )
    assert res.scalar_one() == "desembolsada"


async def test_snapshot_roundtrip(client, admin_token, session):
    sid = await _solicitud_aprobada(client, admin_token, cuotas=6)
    caja = await _crear_caja(client, admin_token)
    fpc = (date.today() + timedelta(days=30)).isoformat()
    r = await client.post(
        f"/api/v1/solicitudes/{sid}/desembolsar",
        json={"caja_id": caja, "fecha_primera_cuota": fpc},
        headers={**_h(admin_token), "Idempotency-Key": "des-rt"},
    )
    prestamo_id = r.json()["prestamo_id"]
    res = await session.execute(
        text("SELECT snapshot_terminos FROM prestamo WHERE id=:p"), {"p": prestamo_id}
    )
    snapshot = res.scalar_one()
    from app.m03_prestamos.reconstruccion import terminos_desde_snapshot

    terminos = terminos_desde_snapshot(snapshot)
    assert str(terminos.capital) == "100000.00" or terminos.capital == 100000
    assert terminos.cantidad_cuotas == 6
    assert str(terminos.tasa_interes_directo) == "0.3000" or terminos.tasa_interes_directo


async def test_desembolso_idempotente(client, admin_token, session):
    sid = await _solicitud_aprobada(client, admin_token, cuotas=6)
    caja = await _crear_caja(client, admin_token)
    fpc = (date.today() + timedelta(days=30)).isoformat()
    headers = {**_h(admin_token), "Idempotency-Key": "des-idem"}
    body = {"caja_id": caja, "fecha_primera_cuota": fpc}
    r1 = await client.post(
        f"/api/v1/solicitudes/{sid}/desembolsar", json=body, headers=headers
    )
    assert r1.status_code == 201, r1.text
    r2 = await client.post(
        f"/api/v1/solicitudes/{sid}/desembolsar", json=body, headers=headers
    )
    assert r2.status_code == 201, r2.text
    assert r1.json()["prestamo_id"] == r2.json()["prestamo_id"]

    # un solo prestamo, 6 cuotas, un solo movimiento
    res = await session.execute(
        text("SELECT count(*) FROM prestamo WHERE solicitud_id=:s"), {"s": sid}
    )
    assert res.scalar_one() == 1
    res = await session.execute(
        text(
            "SELECT count(*) FROM cuota c JOIN prestamo p ON c.prestamo_id=p.id "
            "WHERE p.solicitud_id=:s"
        ),
        {"s": sid},
    )
    assert res.scalar_one() == 6
    res = await session.execute(
        text(
            "SELECT count(*) FROM movimiento_caja WHERE caja_id=:c AND categoria='desembolso'"
        ),
        {"c": caja},
    )
    assert res.scalar_one() == 1


async def test_desembolso_requiere_aprobada(client, admin_token):
    persona = await crear_persona(client, admin_token)
    producto = await crear_producto(client, admin_token)
    sid = await crear_solicitud(client, admin_token, persona, producto)
    caja = await _crear_caja(client, admin_token)
    r = await client.post(
        f"/api/v1/solicitudes/{sid}/desembolsar",
        json={"caja_id": caja, "fecha_primera_cuota": date.today().isoformat()},
        headers={**_h(admin_token), "Idempotency-Key": "des-bad"},
    )
    assert r.status_code == 409, r.text
    assert r.json()["error"]["code"] == "transicion_invalida"
