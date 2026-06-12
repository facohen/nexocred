import uuid

from fastapi import APIRouter, Header

from app.deps import AdminOAnalista, CurrentUser, SessionDep
from app.errors import ErrorAPI
from app.m04_pagos import servicio
from app.m04_pagos.schemas import (
    ImputacionOut,
    PagoCreate,
    PagoDetalleOut,
    PagoOut,
)

router = APIRouter(tags=["pagos"])


def _exigir_idem(idempotency_key: str | None) -> str:
    if not idempotency_key:
        raise ErrorAPI(
            "idempotency_key_requerida",
            "esta operacion requiere header Idempotency-Key",
            status=400,
        )
    return idempotency_key


@router.post("/pagos", response_model=PagoOut, status_code=201)
async def registrar_pago(
    datos: PagoCreate,
    session: SessionDep,
    actor: AdminOAnalista,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> PagoOut:
    clave = _exigir_idem(idempotency_key)
    return await servicio.registrar_pago(
        session,
        prestamo_id=datos.prestamo_id,
        monto=datos.monto,
        canal=datos.canal,
        caja_id=datos.caja_id,
        fecha_negocio=datos.fecha_negocio,
        idempotency_key=clave,
        actor_id=actor.id,
    )


@router.get("/pagos/a-aplicar", response_model=list[PagoOut])
async def pagos_a_aplicar(session: SessionDep, _: AdminOAnalista) -> list[PagoOut]:
    return [PagoOut.model_validate(p) for p in await servicio.pagos_a_aplicar(session)]


@router.get("/pagos/{pago_id}", response_model=PagoDetalleOut)
async def detalle_pago(
    pago_id: uuid.UUID, session: SessionDep, _: CurrentUser
) -> PagoDetalleOut:
    pago = await servicio.obtener_pago(session, pago_id)
    if pago is None:
        raise ErrorAPI("pago_no_encontrado", "pago inexistente", status=404)
    imps = await servicio.imputaciones_de_pago(session, pago_id)
    out = PagoDetalleOut.model_validate(pago)
    out.imputaciones = [ImputacionOut.model_validate(i) for i in imps]
    return out
