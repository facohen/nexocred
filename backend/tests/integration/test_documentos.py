"""Tests de storage adapter, generacion PDF, hash y endpoints de documentos."""

from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.m13_documentos.storage import hash_sha256
from tests._seed_f1d import crear_persona, crear_prestamo, crear_producto
from tests.conftest import TEST_URL

pytestmark = pytest.mark.asyncio


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _seed_prestamo() -> str:
    engine = create_async_engine(TEST_URL)
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as s:
        persona = await crear_persona(s)
        producto = await crear_producto(s)
        prestamo = await crear_prestamo(
            s, persona.id, producto.id, capital=Decimal("100000"),
        )
        await s.commit()
        return str(prestamo.id)


async def test_generar_documento(client, admin_token):
    prestamo_id = await _seed_prestamo()
    r = await client.post(
        "/api/v1/documentos/generar",
        json={"tipo": "recibo", "prestamo_id": prestamo_id},
        headers=_h(admin_token),
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["tipo"] == "recibo"
    assert body["numero"] == 1
    assert len(body["hash_sha256"]) == 64
    assert body["url_storage"] is not None


async def test_numero_secuencial_por_tipo(client, admin_token):
    prestamo_id = await _seed_prestamo()
    n = []
    for _ in range(3):
        r = await client.post(
            "/api/v1/documentos/generar",
            json={"tipo": "cronograma", "prestamo_id": prestamo_id},
            headers=_h(admin_token),
        )
        n.append(r.json()["numero"])
    assert n == [1, 2, 3]


async def test_generar_idempotente(client, admin_token):
    prestamo_id = await _seed_prestamo()
    headers = {**_h(admin_token), "Idempotency-Key": "doc-1"}
    payload = {"tipo": "mutuo", "prestamo_id": prestamo_id}
    r1 = await client.post("/api/v1/documentos/generar", json=payload, headers=headers)
    r2 = await client.post("/api/v1/documentos/generar", json=payload, headers=headers)
    assert r1.json()["id"] == r2.json()["id"]
    assert r1.json()["numero"] == r2.json()["numero"]


async def test_descargar_hash_coincide(client, admin_token):
    prestamo_id = await _seed_prestamo()
    r = await client.post(
        "/api/v1/documentos/generar",
        json={"tipo": "pagare", "prestamo_id": prestamo_id},
        headers=_h(admin_token),
    )
    doc_id = r.json()["id"]
    hash_esperado = r.json()["hash_sha256"]
    r2 = await client.get(f"/api/v1/documentos/{doc_id}/descargar", headers=_h(admin_token))
    assert r2.status_code == 200
    assert r2.content.startswith(b"%PDF")
    assert hash_sha256(r2.content) == hash_esperado


async def test_anular_no_borra(client, admin_token):
    prestamo_id = await _seed_prestamo()
    r = await client.post(
        "/api/v1/documentos/generar",
        json={"tipo": "recibo", "prestamo_id": prestamo_id},
        headers=_h(admin_token),
    )
    doc_id = r.json()["id"]
    r2 = await client.post(
        f"/api/v1/documentos/{doc_id}/anular",
        json={"motivo": "error de carga"}, headers=_h(admin_token),
    )
    assert r2.status_code == 200, r2.text
    assert r2.json()["anulado_en"] is not None
    # sigue existiendo (no se borra)
    r3 = await client.get(f"/api/v1/documentos/{doc_id}", headers=_h(admin_token))
    assert r3.status_code == 200


async def test_listar_documentos_del_prestamo(client, admin_token):
    prestamo_id = await _seed_prestamo()
    await client.post(
        "/api/v1/documentos/generar",
        json={"tipo": "recibo", "prestamo_id": prestamo_id},
        headers=_h(admin_token),
    )
    r = await client.get(
        f"/api/v1/prestamos/{prestamo_id}/documentos", headers=_h(admin_token)
    )
    assert r.status_code == 200, r.text
    assert len(r.json()) == 1


async def test_descargar_detecta_corrupcion(client, admin_token):
    """Si los bytes almacenados no coinciden con doc.hash_sha256, descargar falla
    con documento_corrupto (500) en vez de servir contenido alterado."""
    import uuid as _uuid

    from app.errors import ErrorAPI
    from app.m13_documentos import servicio
    from app.modelos_stub import DocumentoEmitido

    prestamo_id = await _seed_prestamo()
    r = await client.post(
        "/api/v1/documentos/generar",
        json={"tipo": "pagare", "prestamo_id": prestamo_id},
        headers=_h(admin_token),
    )
    doc_id = r.json()["id"]

    engine = create_async_engine(TEST_URL)
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as s:
        doc = await s.get(DocumentoEmitido, _uuid.UUID(doc_id))
        assert doc is not None
        # Tamper de los bytes almacenados (mismo path/url, contenido distinto).
        servicio._storage.guardar(
            f"{doc.tipo}/{doc.tipo}-{doc.numero:08d}.pdf",
            b"%PDF-CONTENIDO-ALTERADO",
        )
        with pytest.raises(ErrorAPI) as exc:
            servicio.leer_bytes(doc)
    await engine.dispose()
    assert exc.value.code == "documento_corrupto"
    assert exc.value.status == 500

    # El endpoint tambien devuelve error (no sirve bytes corruptos).
    r2 = await client.get(
        f"/api/v1/documentos/{doc_id}/descargar", headers=_h(admin_token)
    )
    assert r2.status_code == 500
