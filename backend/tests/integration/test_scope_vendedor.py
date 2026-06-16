"""Scope de lectura por vendedor.

Un vendedor solo puede VER lo suyo: sus solicitudes, sus préstamos y los
clientes detrás de ellos. Admin/analista/ceo ven todo y pueden filtrar
opcionalmente por `vendedor_id`. Esto complementa la atribución de escritura
(ver test_originacion_vendedor): no alcanza con atribuir, hay que scopear las
lecturas para que la cartera del vendedor sea realmente la suya.
"""

from datetime import date, timedelta

from sqlalchemy import text

from tests.api.test_solicitudes import (
    _h,
    cargar_tasa,
    crear_perfil,
    crear_persona,
    crear_producto,
    crear_solicitud,
    sync_bcra,
)
from tests.integration._helpers_f1c import cuil_valido, relajar_bcra
from tests.integration.test_comisiones import _crear_vendedor
from tests.integration.test_desembolso import _crear_caja


async def _persona_y_producto(client, token, dni):
    await relajar_bcra(client, token)
    persona = await crear_persona(client, token, cuil=cuil_valido(dni), dni=dni)
    producto = await crear_producto(client, token)
    perfil = await crear_perfil(client, token)
    await cargar_tasa(client, token, producto, perfil, 6, tasa="0.30")
    await sync_bcra(client, token, persona)
    return persona, producto


async def _crear_solicitud(client, token, persona, producto):
    r = await client.post(
        "/api/v1/solicitudes",
        json={"persona_id": persona, "producto_id": producto,
              "monto": "100000.00", "cantidad_cuotas": 6},
        headers=_h(token),
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def test_vendedor_solo_ve_sus_solicitudes(client, admin_token):
    """Dos vendedores originan; cada uno solo ve la solicitud que creó."""
    p1, prod = await _persona_y_producto(client, admin_token, "75000001")
    p2, _ = await _persona_y_producto(client, admin_token, "75000002")
    v1 = await _crear_vendedor(client, admin_token, "scope_v1@nexo.test")
    v2 = await _crear_vendedor(client, admin_token, "scope_v2@nexo.test")

    s1 = await _crear_solicitud(client, v1["token"], p1, prod)
    s2 = await _crear_solicitud(client, v2["token"], p2, prod)

    r1 = await client.get("/api/v1/solicitudes", headers=_h(v1["token"]))
    assert r1.status_code == 200, r1.text
    ids1 = {s["id"] for s in r1.json()["data"]}
    assert s1 in ids1
    assert s2 not in ids1

    r2 = await client.get("/api/v1/solicitudes", headers=_h(v2["token"]))
    ids2 = {s["id"] for s in r2.json()["data"]}
    assert s2 in ids2
    assert s1 not in ids2


async def test_admin_ve_todas_las_solicitudes_y_filtra_por_vendedor(
    client, admin_token
):
    """Admin ve las solicitudes de todos; con ?vendedor_id filtra a uno."""
    p1, prod = await _persona_y_producto(client, admin_token, "75000010")
    p2, _ = await _persona_y_producto(client, admin_token, "75000011")
    v1 = await _crear_vendedor(client, admin_token, "scope_a1@nexo.test")
    v2 = await _crear_vendedor(client, admin_token, "scope_a2@nexo.test")

    s1 = await _crear_solicitud(client, v1["token"], p1, prod)
    s2 = await _crear_solicitud(client, v2["token"], p2, prod)

    todas = await client.get("/api/v1/solicitudes", headers=_h(admin_token))
    ids = {s["id"] for s in todas.json()["data"]}
    assert {s1, s2} <= ids

    filtrada = await client.get(
        f"/api/v1/solicitudes?vendedor_id={v1['id']}", headers=_h(admin_token)
    )
    idsf = {s["id"] for s in filtrada.json()["data"]}
    assert s1 in idsf
    assert s2 not in idsf


async def _prestamo_de_vendedor(client, admin_token, session, dni, vendedor_id):
    """Desembolsa un préstamo (flujo real como admin) y lo atribuye al vendedor
    indicado vía SQL — el préstamo hereda vendedor_id de la solicitud, así que
    reasignamos para tener un dueño determinístico en el test."""
    await relajar_bcra(client, admin_token)
    persona = await crear_persona(client, admin_token, cuil=cuil_valido(dni), dni=dni)
    producto = await crear_producto(client, admin_token)
    perfil = await crear_perfil(client, admin_token)
    await cargar_tasa(client, admin_token, producto, perfil, 6, tasa="0.30")
    await sync_bcra(client, admin_token, persona)
    sid = await crear_solicitud(client, admin_token, persona, producto, cantidad_cuotas=6)
    await client.post(f"/api/v1/solicitudes/{sid}/evaluar", headers=_h(admin_token))
    await client.patch(
        f"/api/v1/solicitudes/{sid}/estado", json={"estado": "aprobada"},
        headers=_h(admin_token),
    )
    caja = await _crear_caja(client, admin_token)
    fneg = date.today()
    r = await client.post(
        f"/api/v1/solicitudes/{sid}/desembolsar",
        json={"caja_id": caja, "fecha_negocio": fneg.isoformat(),
              "fecha_primera_cuota": (fneg + timedelta(days=30)).isoformat(),
              "tasa_punitorio_diario": "0"},
        headers={**_h(admin_token), "Idempotency-Key": f"scope-pres-{dni}"},
    )
    assert r.status_code == 201, r.text
    pid = r.json()["prestamo_id"]
    await session.execute(
        text("UPDATE prestamo SET vendedor_id=:v WHERE id=:p"),
        {"v": vendedor_id, "p": pid},
    )
    await session.commit()
    return pid


async def test_vendedor_solo_ve_sus_prestamos(client, admin_token, session):
    v1 = await _crear_vendedor(client, admin_token, "scope_p1@nexo.test")
    v2 = await _crear_vendedor(client, admin_token, "scope_p2@nexo.test")
    pid1 = await _prestamo_de_vendedor(client, admin_token, session, "76000001", v1["id"])
    pid2 = await _prestamo_de_vendedor(client, admin_token, session, "76000002", v2["id"])

    r1 = await client.get("/api/v1/prestamos", headers=_h(v1["token"]))
    assert r1.status_code == 200, r1.text
    ids1 = {p["id"] for p in r1.json()["data"]}
    assert pid1 in ids1
    assert pid2 not in ids1


async def test_admin_ve_todos_los_prestamos_y_filtra_por_vendedor(
    client, admin_token, session
):
    v1 = await _crear_vendedor(client, admin_token, "scope_pa1@nexo.test")
    v2 = await _crear_vendedor(client, admin_token, "scope_pa2@nexo.test")
    pid1 = await _prestamo_de_vendedor(client, admin_token, session, "76000010", v1["id"])
    pid2 = await _prestamo_de_vendedor(client, admin_token, session, "76000011", v2["id"])

    todos = await client.get("/api/v1/prestamos", headers=_h(admin_token))
    ids = {p["id"] for p in todos.json()["data"]}
    assert {pid1, pid2} <= ids

    filtrado = await client.get(
        f"/api/v1/prestamos?vendedor_id={v1['id']}", headers=_h(admin_token)
    )
    idsf = {p["id"] for p in filtrado.json()["data"]}
    assert pid1 in idsf
    assert pid2 not in idsf


async def test_vendedor_solo_ve_sus_clientes(client, admin_token):
    """La cartera de clientes del vendedor = personas detrás de SUS solicitudes.
    Persona no tiene vendedor_id; el scope se resuelve por subquery."""
    pA, prod = await _persona_y_producto(client, admin_token, "77000001")
    pB, _ = await _persona_y_producto(client, admin_token, "77000002")
    v1 = await _crear_vendedor(client, admin_token, "scope_c1@nexo.test")
    v2 = await _crear_vendedor(client, admin_token, "scope_c2@nexo.test")
    await _crear_solicitud(client, v1["token"], pA, prod)
    await _crear_solicitud(client, v2["token"], pB, prod)

    r1 = await client.get("/api/v1/personas", headers=_h(v1["token"]))
    assert r1.status_code == 200, r1.text
    ids1 = {p["id"] for p in r1.json()["data"]}
    assert pA in ids1
    assert pB not in ids1


async def test_admin_ve_todas_las_personas_y_filtra_por_vendedor(client, admin_token):
    pA, prod = await _persona_y_producto(client, admin_token, "77000010")
    pB, _ = await _persona_y_producto(client, admin_token, "77000011")
    v1 = await _crear_vendedor(client, admin_token, "scope_ca1@nexo.test")
    v2 = await _crear_vendedor(client, admin_token, "scope_ca2@nexo.test")
    await _crear_solicitud(client, v1["token"], pA, prod)
    await _crear_solicitud(client, v2["token"], pB, prod)

    todas = await client.get("/api/v1/personas", headers=_h(admin_token))
    ids = {p["id"] for p in todas.json()["data"]}
    assert {pA, pB} <= ids

    filtrada = await client.get(
        f"/api/v1/personas?vendedor_id={v1['id']}", headers=_h(admin_token)
    )
    idsf = {p["id"] for p in filtrada.json()["data"]}
    assert pA in idsf
    assert pB not in idsf
