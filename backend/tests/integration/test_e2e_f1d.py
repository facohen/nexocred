"""E2E F1d: snapshot repetible -> La Torre desde el snapshot; workflow idempotente;
documento con hash/numero estables."""

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.m04_caja.modelos import Caja
from app.modelos_stub import Cuota
from tests._seed_f1d import crear_persona, crear_prestamo, crear_producto
from tests.conftest import TEST_URL

pytestmark = pytest.mark.asyncio

HOY = date(2026, 6, 11)


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _seed() -> tuple[str, str]:
    engine = create_async_engine(TEST_URL)
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as s:
        persona = await crear_persona(s)
        producto = await crear_producto(s)
        p = await crear_prestamo(
            s, persona.id, producto.id, capital=Decimal("100000"),
            fecha_desembolso=HOY.replace(day=1),
        )
        s.add(Cuota(
            prestamo_id=p.id, numero=1, vencimiento=HOY,
            capital=Decimal("100000"), interes=Decimal("10000"),
            cuota=Decimal("110000"), estado="pendiente",
        ))
        s.add(Caja(nombre="Principal", tipo="efectivo", saldo_teorico=Decimal("80000")))
        await s.commit()
        return str(persona.id), str(p.id)


async def test_snapshot_repetible_y_torre_desde_snapshot(client, admin_token):
    await _seed()
    body = {"fecha_corte": HOY.isoformat()}
    r1 = await client.post("/api/v1/torre/snapshot", json=body, headers=_h(admin_token))
    r2 = await client.post("/api/v1/torre/snapshot", json=body, headers=_h(admin_token))
    assert r1.json() == r2.json()  # metricas estables

    # La Torre renderiza desde el snapshot persistido
    r = await client.get("/api/v1/torre/pulso", headers=_h(admin_token))
    tarjetas = {t["clave"]: t["valor"] for t in r.json()["tarjetas"]}
    assert tarjetas["capital_disponible"] == "80000.00"
    assert tarjetas["prestamos_vigentes"] == "1"


async def test_workflow_trigger_doble_no_duplica(client, admin_token):
    persona_id, prestamo_id = await _seed()
    await client.post(
        "/api/v1/workflow-reglas",
        json={"nombre": "R", "familia": "cobranza", "disparador": "mora_dia_3",
              "accion": "crear_tarea"},
        headers=_h(admin_token),
    )
    ctx = {"disparador": "mora_dia_3", "prestamo_id": prestamo_id,
           "persona_id": persona_id}
    await client.post("/api/v1/workflows/procesar", json=ctx, headers=_h(admin_token))
    await client.post("/api/v1/workflows/procesar", json=ctx, headers=_h(admin_token))
    r = await client.get("/api/v1/workflows/ejecuciones", headers=_h(admin_token))
    assert len(r.json()) == 1


async def test_documento_hash_numero_estable(client, admin_token):
    _, prestamo_id = await _seed()
    r = await client.post(
        "/api/v1/documentos/generar",
        json={"tipo": "recibo", "prestamo_id": prestamo_id},
        headers=_h(admin_token),
    )
    doc_id = r.json()["id"]
    hash1 = r.json()["hash_sha256"]
    numero1 = r.json()["numero"]
    # descarga: el hash del contenido coincide con el persistido
    from app.m13_documentos.storage import hash_sha256
    r2 = await client.get(f"/api/v1/documentos/{doc_id}/descargar", headers=_h(admin_token))
    assert hash_sha256(r2.content) == hash1
    # el detalle conserva numero/hash
    r3 = await client.get(f"/api/v1/documentos/{doc_id}", headers=_h(admin_token))
    assert r3.json()["hash_sha256"] == hash1
    assert r3.json()["numero"] == numero1
