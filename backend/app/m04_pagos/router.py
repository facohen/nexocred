import uuid

from fastapi import APIRouter, Header, Query

from app.deps import Administrativo, CurrentUser, SessionDep, exigir_idem
from app.errors import ErrorAPI
from app.m04_pagos import servicio
from app.m04_pagos.schemas import (
    CorreccionIn,
    CorreccionOut,
    ImputacionOut,
    PagoCreate,
    PagoDetalleOut,
    PagoOut,
)
from app.paginacion import Pagina, paginar

router = APIRouter(tags=["pagos"])


@router.post("/pagos", response_model=PagoOut, status_code=201)
async def registrar_pago(
    datos: PagoCreate,
    session: SessionDep,
    actor: Administrativo,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> PagoOut:
    clave = exigir_idem(idempotency_key)
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


@router.get("/pagos/a-aplicar", response_model=Pagina[PagoOut])
async def pagos_a_aplicar(
    session: SessionDep,
    _: Administrativo,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
) -> Pagina[PagoOut]:
    pagos_list = [PagoOut.model_validate(p) for p in await servicio.pagos_a_aplicar(session)]
    return paginar(pagos_list, page, per_page)


@router.post("/pagos/{pago_id}/corregir", response_model=CorreccionOut, status_code=201)
async def corregir_pago(
    pago_id: uuid.UUID,
    datos: CorreccionIn,
    session: SessionDep,
    actor: Administrativo,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> CorreccionOut:
    clave = exigir_idem(idempotency_key)
    return await servicio.corregir(
        session,
        pago_original_id=pago_id,
        monto=datos.monto,
        canal=datos.canal,
        caja_id=datos.caja_id,
        fecha_negocio=datos.fecha_negocio,
        idempotency_key=clave,
        actor_id=actor.id,
    )


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
