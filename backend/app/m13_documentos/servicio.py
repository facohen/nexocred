"""Servicio M13: generar (numero -> PDF -> hash -> storage -> persistir) en UNA
transaccion, idempotente por Idempotency-Key; descargar; anular (sin borrar); listar.
"""

import json
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auditoria import escribir_evento
from app.config import configuracion
from app.errors import ErrorAPI
from app.idempotencia import IdempotencyKey, guardar_resultado_idempotente
from app.m13_documentos.numeracion import asignar_numero
from app.m13_documentos.pdf import generar_pdf
from app.m13_documentos.schemas import TIPOS
from app.m13_documentos.storage import StorageLocal, hash_sha256
from app.modelos_stub import Cuota, DocumentoEmitido, Prestamo

_storage = StorageLocal(configuracion.documentos_dir)


async def _datos_documento(
    session: AsyncSession, prestamo: Prestamo, tipo: str, numero: int
) -> dict:
    datos: dict = {
        "numero": numero,
        "prestamo_id": str(prestamo.id),
        "capital": f"{prestamo.capital:.2f}" if prestamo.capital is not None else None,
    }
    if tipo == "cronograma":
        res = await session.execute(
            select(Cuota).where(Cuota.prestamo_id == prestamo.id).order_by(Cuota.numero)
        )
        datos["filas"] = [
            {
                "numero": c.numero,
                "vencimiento": c.vencimiento.isoformat() if c.vencimiento else "",
                "capital": f"{c.capital:.2f}" if c.capital is not None else "",
                "interes": f"{c.interes:.2f}" if c.interes is not None else "",
                "total": f"{c.cuota:.2f}" if c.cuota is not None else "",
            }
            for c in res.scalars().all()
        ]
    return datos


async def generar(
    session: AsyncSession,
    *,
    tipo: str,
    prestamo_id: uuid.UUID,
    actor_id: uuid.UUID,
    idempotency_key: str | None,
) -> DocumentoEmitido:
    if tipo not in TIPOS:
        raise ErrorAPI("tipo_invalido", f"tipo de documento invalido: {tipo}", status=422)

    operacion = "documento_generar"
    if idempotency_key is not None:
        existente = await guardar_resultado_idempotente(
            session, idempotency_key, operacion, None
        )
        if existente is not None:
            doc_id = uuid.UUID(json.loads(existente)["documento_id"])
            doc = await session.get(DocumentoEmitido, doc_id)
            assert doc is not None
            return doc

    prestamo = await session.get(Prestamo, prestamo_id)
    if prestamo is None:
        raise ErrorAPI("prestamo_no_encontrado", "prestamo inexistente", status=404)

    numero = await asignar_numero(session, tipo)
    datos = await _datos_documento(session, prestamo, tipo, numero)
    contenido = generar_pdf(tipo, datos)
    hash_doc = hash_sha256(contenido)
    url = _storage.guardar(f"{tipo}/{tipo}-{numero:08d}.pdf", contenido)

    doc = DocumentoEmitido(
        prestamo_id=prestamo_id, tipo=tipo, numero=numero, hash_sha256=hash_doc,
        url_storage=url, emitido_por=actor_id,
    )
    session.add(doc)
    await session.flush()

    if idempotency_key is not None:
        res = await session.execute(
            select(IdempotencyKey).where(
                IdempotencyKey.clave == idempotency_key,
                IdempotencyKey.operacion == operacion,
            )
        )
        res.scalar_one().respuesta_json = json.dumps({"documento_id": str(doc.id)})

    await escribir_evento(
        session, actor_id=actor_id, accion="documento_generado",
        entidad="documento_emitido", entidad_id=doc.id,
        metadata_json={"tipo": tipo, "numero": numero, "hash": hash_doc},
    )
    await session.commit()
    await session.refresh(doc)
    return doc


async def obtener(
    session: AsyncSession, documento_id: uuid.UUID
) -> DocumentoEmitido | None:
    return await session.get(DocumentoEmitido, documento_id)


def leer_bytes(doc: DocumentoEmitido) -> bytes:
    if doc.url_storage is None:
        raise ErrorAPI("sin_contenido", "el documento no tiene contenido", status=404)
    contenido = _storage.leer(doc.url_storage)
    # Integridad: el documento es inmutable/auditable; verificamos que los bytes
    # almacenados sigan correspondiendo al hash sellado en emision antes de servirlos.
    if doc.hash_sha256 is not None and hash_sha256(contenido) != doc.hash_sha256:
        raise ErrorAPI(
            "documento_corrupto",
            "el contenido almacenado no coincide con el hash del documento",
            status=500,
        )
    return contenido


async def anular(
    session: AsyncSession, doc: DocumentoEmitido, *, motivo: str, actor_id: uuid.UUID
) -> DocumentoEmitido:
    if doc.anulado_en is not None:
        raise ErrorAPI("ya_anulado", "el documento ya fue anulado", status=409)
    doc.anulado_en = datetime.now(UTC)
    doc.anulado_por = actor_id
    await session.flush()
    await escribir_evento(
        session, actor_id=actor_id, accion="documento_anulado",
        entidad="documento_emitido", entidad_id=doc.id,
        metadata_json={"motivo": motivo},
    )
    await session.commit()
    await session.refresh(doc)
    return doc


async def listar_por_prestamo(
    session: AsyncSession, prestamo_id: uuid.UUID
) -> list[DocumentoEmitido]:
    res = await session.execute(
        select(DocumentoEmitido)
        .where(DocumentoEmitido.prestamo_id == prestamo_id)
        .order_by(DocumentoEmitido.created_at.desc())
    )
    return list(res.scalars().all())
