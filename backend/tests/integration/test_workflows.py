"""Tests de integracion del motor de workflows (CRUD reglas + procesar)."""

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from tests._seed_f1d import crear_persona, crear_prestamo, crear_producto
from tests.conftest import make_test_engine

pytestmark = pytest.mark.asyncio


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _seed_prestamo() -> tuple[str, str]:
    engine = make_test_engine()
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as s:
        persona = await crear_persona(s)
        producto = await crear_producto(s)
        prestamo = await crear_prestamo(
            s, persona.id, producto.id, capital=Decimal("100000"),
            fecha_desembolso=date(2026, 6, 1),
        )
        await s.commit()
        return str(persona.id), str(prestamo.id)


async def _crear_regla(client, token, **kw) -> str:
    body = {"nombre": "Mora 3 dias", "familia": "cobranza",
            "disparador": "mora_dia_3", "accion": "crear_tarea"}
    body.update(kw)
    r = await client.post("/api/v1/workflow-reglas", json=body, headers=_h(token))
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def test_crud_regla(client, admin_token):
    regla_id = await _crear_regla(client, admin_token)
    r = await client.get("/api/v1/workflow-reglas", headers=_h(admin_token))
    assert regla_id in [x["id"] for x in r.json()["data"]]
    r = await client.patch(
        f"/api/v1/workflow-reglas/{regla_id}", json={"activo": False},
        headers=_h(admin_token),
    )
    assert r.json()["activo"] is False


async def test_familia_invalida_422(client, admin_token):
    r = await client.post(
        "/api/v1/workflow-reglas",
        json={"nombre": "x", "familia": "marketing", "disparador": "z",
              "accion": "crear_tarea"},
        headers=_h(admin_token),
    )
    assert r.status_code == 422


async def test_procesar_dispara_y_es_idempotente(client, admin_token):
    persona_id, prestamo_id = await _seed_prestamo()
    await _crear_regla(client, admin_token)
    ctx = {"disparador": "mora_dia_3", "prestamo_id": prestamo_id,
           "persona_id": persona_id}

    r1 = await client.post("/api/v1/workflows/procesar", json=ctx, headers=_h(admin_token))
    assert r1.status_code == 200, r1.text
    assert r1.json()["disparados"] == 1

    r2 = await client.post("/api/v1/workflows/procesar", json=ctx, headers=_h(admin_token))
    assert r2.json()["disparados"] == 0
    assert r2.json()["omitidos"] == 1

    # ejecuciones: exactamente una
    r = await client.get("/api/v1/workflows/ejecuciones", headers=_h(admin_token))
    assert len(r.json()["data"]) == 1


async def test_procesar_solo_admin(client, tesoreria_token):
    r = await client.post(
        "/api/v1/workflows/procesar",
        json={"disparador": "mora_dia_3"}, headers=_h(tesoreria_token),
    )
    assert r.status_code == 403
