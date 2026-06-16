"""Tests de la espina de cobranzas: PromesaPago + job reconciliar-promesas.

Casos cubiertos:
  1. Crear promesa → estado 'vigente'
  2. Crear sin origen → 422
  3. Crear con ambos origenes → 422
  4. Reconciliar: saldo baja a 0 → 'cumplida'
  5. Reconciliar: fecha vencida, sin pago → 'rota' + tarea creada
  6. Job reconciliar-promesas idempotente: 2 llamadas → 1 sola tarea (no duplica)
  7. Listar promesas filtradas por prestamo_id y estado
  8. Detalle de promesa 404
"""
from datetime import date, timedelta

from sqlalchemy import text

from tests.integration._helpers_f1c import cuil_valido, relajar_bcra
from tests.integration.test_pagos_waterfall import _prestamo_desembolsado


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _interaccion(client, token, persona_id: str) -> str:
    r = await client.post(
        "/api/v1/interacciones",
        json={"persona_id": persona_id, "tipo": "llamada", "detalle": "contacto previo"},
        headers=_h(token),
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


# ---------------------------------------------------------------------------
# 1. Crear promesa → estado 'vigente'
# ---------------------------------------------------------------------------
async def test_crear_promesa_vigente(client, admin_token, session):
    await relajar_bcra(client, admin_token)
    prestamo_id, _ = await _prestamo_desembolsado(
        client, admin_token, session,
        cuil=cuil_valido("91000001"), dni="91000001",
    )
    res = await session.execute(
        text("SELECT persona_id FROM prestamo WHERE id=:p"), {"p": prestamo_id}
    )
    persona_id = str(res.scalar_one())
    interaccion_id = await _interaccion(client, admin_token, persona_id)

    manana = (date.today() + timedelta(days=3)).isoformat()
    r = await client.post(
        "/api/v1/promesas",
        json={
            "prestamo_id": prestamo_id,
            "monto_prometido": "5000.00",
            "fecha_prometida": manana,
            "canal_origen": "call",
            "interaccion_id": interaccion_id,
        },
        headers=_h(admin_token),
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["estado"] == "vigente"
    assert body["prestamo_id"] == prestamo_id
    assert body["canal_origen"] == "call"
    assert body["interaccion_id"] == interaccion_id


# ---------------------------------------------------------------------------
# 2. Crear sin ningún origen → 422
# ---------------------------------------------------------------------------
async def test_crear_promesa_sin_origen_422(client, admin_token, session):
    await relajar_bcra(client, admin_token)
    prestamo_id, _ = await _prestamo_desembolsado(
        client, admin_token, session,
        cuil=cuil_valido("91000002"), dni="91000002",
    )
    manana = (date.today() + timedelta(days=3)).isoformat()
    r = await client.post(
        "/api/v1/promesas",
        json={
            "prestamo_id": prestamo_id,
            "monto_prometido": "5000.00",
            "fecha_prometida": manana,
            "canal_origen": "call",
            # sin interaccion_id ni parada_ruta_id
        },
        headers=_h(admin_token),
    )
    assert r.status_code == 422, r.text


# ---------------------------------------------------------------------------
# 3. Crear con ambos origenes → 422
# ---------------------------------------------------------------------------
async def test_crear_promesa_ambos_origenes_422(client, admin_token, session):
    await relajar_bcra(client, admin_token)
    prestamo_id, _ = await _prestamo_desembolsado(
        client, admin_token, session,
        cuil=cuil_valido("91000003"), dni="91000003",
    )
    res = await session.execute(
        text("SELECT persona_id FROM prestamo WHERE id=:p"), {"p": prestamo_id}
    )
    persona_id = str(res.scalar_one())
    interaccion_id = await _interaccion(client, admin_token, persona_id)
    manana = (date.today() + timedelta(days=3)).isoformat()
    r = await client.post(
        "/api/v1/promesas",
        json={
            "prestamo_id": prestamo_id,
            "monto_prometido": "5000.00",
            "fecha_prometida": manana,
            "canal_origen": "call",
            "interaccion_id": interaccion_id,
            "parada_ruta_id": "00000000-0000-0000-0000-000000000001",
        },
        headers=_h(admin_token),
    )
    assert r.status_code == 422, r.text


# ---------------------------------------------------------------------------
# 4. Reconciliar: saldo baja a 0 → 'cumplida'
# ---------------------------------------------------------------------------
async def test_reconciliar_promesa_cumplida(client, admin_token, session):
    await relajar_bcra(client, admin_token)
    prestamo_id, caja = await _prestamo_desembolsado(
        client, admin_token, session,
        cuil=cuil_valido("91000004"), dni="91000004",
    )
    res = await session.execute(
        text("SELECT persona_id FROM prestamo WHERE id=:p"), {"p": prestamo_id}
    )
    persona_id = str(res.scalar_one())
    interaccion_id = await _interaccion(client, admin_token, persona_id)

    # Crear promesa vigente con fecha futura
    manana = (date.today() + timedelta(days=3)).isoformat()
    r = await client.post(
        "/api/v1/promesas",
        json={
            "prestamo_id": prestamo_id,
            "monto_prometido": "5000.00",
            "fecha_prometida": manana,
            "canal_origen": "call",
            "interaccion_id": interaccion_id,
        },
        headers=_h(admin_token),
    )
    assert r.status_code == 201, r.text
    promesa_id = r.json()["id"]

    # Marcar todas las cuotas del préstamo como pagadas directo en DB
    await session.execute(
        text("UPDATE cuota SET estado='pagada' WHERE prestamo_id=:p"),
        {"p": prestamo_id},
    )
    await session.commit()

    # Reconciliar → cumplida
    rec = await client.post(
        f"/api/v1/promesas/{promesa_id}/reconciliar",
        headers=_h(admin_token),
    )
    assert rec.status_code == 200, rec.text
    estados = [p["estado"] for p in rec.json()]
    assert "cumplida" in estados

    # Verificar en detalle
    det = await client.get(f"/api/v1/promesas/{promesa_id}", headers=_h(admin_token))
    assert det.json()["estado"] == "cumplida"


# ---------------------------------------------------------------------------
# 5. Reconciliar: fecha vencida, sin pago → 'rota' + tarea creada
# ---------------------------------------------------------------------------
async def test_reconciliar_promesa_rota_genera_tarea(client, admin_token, session):
    await relajar_bcra(client, admin_token)
    prestamo_id, _ = await _prestamo_desembolsado(
        client, admin_token, session,
        cuil=cuil_valido("91000005"), dni="91000005",
    )
    res = await session.execute(
        text("SELECT persona_id FROM prestamo WHERE id=:p"), {"p": prestamo_id}
    )
    persona_id = str(res.scalar_one())
    interaccion_id = await _interaccion(client, admin_token, persona_id)

    # Promesa con fecha ya vencida
    ayer = (date.today() - timedelta(days=1)).isoformat()
    r = await client.post(
        "/api/v1/promesas",
        json={
            "prestamo_id": prestamo_id,
            "monto_prometido": "5000.00",
            "fecha_prometida": ayer,
            "canal_origen": "call",
            "interaccion_id": interaccion_id,
        },
        headers=_h(admin_token),
    )
    assert r.status_code == 201, r.text
    promesa_id = r.json()["id"]

    # Reconciliar → rota (no hay pagos, fecha pasada)
    rec = await client.post(
        f"/api/v1/promesas/{promesa_id}/reconciliar",
        headers=_h(admin_token),
    )
    assert rec.status_code == 200, rec.text
    estados = [p["estado"] for p in rec.json()]
    assert "rota" in estados

    # Debe haber una tarea con origen='promesa_rota'
    res = await session.execute(
        text(
            "SELECT count(*) FROM tarea "
            "WHERE origen='promesa_rota' AND promesa_id=:pid"
        ),
        {"pid": promesa_id},
    )
    assert res.scalar_one() == 1


# ---------------------------------------------------------------------------
# 6. Job reconciliar-promesas idempotente: 2 ejecuciones → 1 sola tarea
# ---------------------------------------------------------------------------
async def test_job_reconciliar_idempotente(client, admin_token, session):
    await relajar_bcra(client, admin_token)
    prestamo_id, _ = await _prestamo_desembolsado(
        client, admin_token, session,
        cuil=cuil_valido("91000006"), dni="91000006",
    )
    res = await session.execute(
        text("SELECT persona_id FROM prestamo WHERE id=:p"), {"p": prestamo_id}
    )
    persona_id = str(res.scalar_one())
    interaccion_id = await _interaccion(client, admin_token, persona_id)

    # Promesa con fecha vencida
    ayer = (date.today() - timedelta(days=1)).isoformat()
    r = await client.post(
        "/api/v1/promesas",
        json={
            "prestamo_id": prestamo_id,
            "monto_prometido": "5000.00",
            "fecha_prometida": ayer,
            "canal_origen": "campo",
            "interaccion_id": interaccion_id,
        },
        headers=_h(admin_token),
    )
    assert r.status_code == 201, r.text
    promesa_id = r.json()["id"]

    fecha_corte = date.today().isoformat()

    # Primera ejecución del job
    j1 = await client.post(
        "/api/v1/jobs/reconciliar-promesas",
        json={"fecha_corte": fecha_corte},
        headers=_h(admin_token),
    )
    assert j1.status_code == 200, j1.text
    assert j1.json()["promesas_rotas"] >= 1

    # Segunda ejecución del job (no quedan vigentes, no debe crear nueva tarea)
    j2 = await client.post(
        "/api/v1/jobs/reconciliar-promesas",
        json={"fecha_corte": fecha_corte},
        headers=_h(admin_token),
    )
    assert j2.status_code == 200, j2.text
    # Segunda corrida no encuentra promesas vigentes → 0 procesadas
    assert j2.json()["promesas_procesadas"] == 0

    # Solo existe 1 tarea promesa_rota para esta promesa
    res = await session.execute(
        text(
            "SELECT count(*) FROM tarea "
            "WHERE origen='promesa_rota' AND promesa_id=:pid"
        ),
        {"pid": promesa_id},
    )
    assert res.scalar_one() == 1


# ---------------------------------------------------------------------------
# 7. Listar promesas filtradas
# ---------------------------------------------------------------------------
async def test_listar_promesas_filtros(client, admin_token, session):
    await relajar_bcra(client, admin_token)
    prestamo_id, _ = await _prestamo_desembolsado(
        client, admin_token, session,
        cuil=cuil_valido("91000007"), dni="91000007",
    )
    res = await session.execute(
        text("SELECT persona_id FROM prestamo WHERE id=:p"), {"p": prestamo_id}
    )
    persona_id = str(res.scalar_one())
    interaccion_id = await _interaccion(client, admin_token, persona_id)

    manana = (date.today() + timedelta(days=5)).isoformat()
    await client.post(
        "/api/v1/promesas",
        json={
            "prestamo_id": prestamo_id,
            "monto_prometido": "1000.00",
            "fecha_prometida": manana,
            "canal_origen": "call",
            "interaccion_id": interaccion_id,
        },
        headers=_h(admin_token),
    )

    # Filtro por prestamo_id
    r = await client.get(
        f"/api/v1/promesas?prestamo_id={prestamo_id}",
        headers=_h(admin_token),
    )
    assert r.status_code == 200, r.text
    items = r.json()["data"]
    assert len(items) >= 1
    assert all(p["prestamo_id"] == prestamo_id for p in items)

    # Filtro por estado=vigente
    r2 = await client.get(
        f"/api/v1/promesas?prestamo_id={prestamo_id}&estado=vigente",
        headers=_h(admin_token),
    )
    assert r2.status_code == 200
    assert all(p["estado"] == "vigente" for p in r2.json()["data"])


# ---------------------------------------------------------------------------
# 8. Detalle de promesa inexistente → 404
# ---------------------------------------------------------------------------
async def test_promesa_inexistente_404(client, admin_token):
    r = await client.get(
        "/api/v1/promesas/00000000-0000-0000-0000-000000000099",
        headers=_h(admin_token),
    )
    assert r.status_code == 404, r.text
