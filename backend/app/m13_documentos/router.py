import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Header
from fastapi.responses import Response

from app.deps import SessionDep, requiere_rol
from app.errors import ErrorAPI
from app.m12_auth.modelos import Usuario
from app.m13_documentos import servicio
from app.m13_documentos.schemas import AnularIn, DocumentoOut, GenerarIn

router = APIRouter(tags=["documentos"])

DocUser = Annotated[Usuario, Depends(requiere_rol("admin", "analista", "operador"))]


async def _get_doc(session, documento_id: uuid.UUID):
    doc = await servicio.obtener(session, documento_id)
    if doc is None:
        raise ErrorAPI("documento_no_encontrado", "documento inexistente", status=404)
    return doc


@router.post("/documentos/generar", response_model=DocumentoOut, status_code=201)
async def generar_documento(
    datos: GenerarIn,
    session: SessionDep,
    actor: DocUser,
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> DocumentoOut:
    doc = await servicio.generar(
        session, tipo=datos.tipo, prestamo_id=datos.prestamo_id,
        actor_id=actor.id, idempotency_key=idempotency_key,
    )
    return DocumentoOut.model_validate(doc)


@router.get("/documentos/{documento_id}", response_model=DocumentoOut)
async def detalle_documento(
    documento_id: uuid.UUID, session: SessionDep, _: DocUser
) -> DocumentoOut:
    doc = await _get_doc(session, documento_id)
    return DocumentoOut.model_validate(doc)


@router.get("/documentos/{documento_id}/descargar")
async def descargar_documento(
    documento_id: uuid.UUID, session: SessionDep, _: DocUser
) -> Response:
    doc = await _get_doc(session, documento_id)
    contenido = servicio.leer_bytes(doc)
    return Response(
        content=contenido, media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{doc.tipo}-{doc.numero:08d}.pdf"',
        },
    )


@router.post("/documentos/{documento_id}/anular", response_model=DocumentoOut)
async def anular_documento(
    documento_id: uuid.UUID, datos: AnularIn, session: SessionDep, actor: DocUser
) -> DocumentoOut:
    doc = await _get_doc(session, documento_id)
    doc = await servicio.anular(session, doc, motivo=datos.motivo, actor_id=actor.id)
    return DocumentoOut.model_validate(doc)


@router.get("/prestamos/{prestamo_id}/documentos", response_model=list[DocumentoOut])
async def documentos_del_prestamo(
    prestamo_id: uuid.UUID, session: SessionDep, _: DocUser
) -> list[DocumentoOut]:
    docs = await servicio.listar_por_prestamo(session, prestamo_id)
    return [DocumentoOut.model_validate(d) for d in docs]
