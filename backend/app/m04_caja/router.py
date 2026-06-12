import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Header, Query

from app.deps import AdminOAnalista, AdminUser, CurrentUser, SessionDep
from app.errors import ErrorAPI
from app.m04_caja import servicio
from app.m04_caja.schemas import (
    ArqueoIn,
    ArqueoOut,
    ArqueoPendienteOut,
    CajaCreate,
    CajaOut,
    MovimientoIn,
    MovimientoOut,
    PosicionConsolidadaOut,
    TransferenciaIn,
)

router = APIRouter(tags=["caja"])


@router.get("/cajas", response_model=list[CajaOut])
async def listar_cajas(session: SessionDep, _: CurrentUser) -> list[CajaOut]:
    return [CajaOut.model_validate(c) for c in await servicio.listar_cajas(session)]


@router.post("/cajas", response_model=CajaOut, status_code=201)
async def crear_caja(
    datos: CajaCreate, session: SessionDep, actor: AdminUser
) -> CajaOut:
    caja = await servicio.crear_caja(session, datos.nombre, datos.tipo, actor_id=actor.id)
    await session.commit()
    return CajaOut.model_validate(caja)


@router.get("/cajas/posicion-consolidada", response_model=PosicionConsolidadaOut)
async def posicion_consolidada(
    session: SessionDep, _: CurrentUser
) -> PosicionConsolidadaOut:
    total, cajas = await servicio.posicion_consolidada(session)
    return PosicionConsolidadaOut(
        total=total, cajas=[CajaOut.model_validate(c) for c in cajas]
    )


@router.get("/cajas/{caja_id}/movimientos", response_model=list[MovimientoOut])
async def listar_movimientos(
    caja_id: uuid.UUID,
    session: SessionDep,
    _: CurrentUser,
    desde: Annotated[date | None, Query()] = None,
    hasta: Annotated[date | None, Query()] = None,
) -> list[MovimientoOut]:
    movs = await servicio.listar_movimientos(session, caja_id, desde=desde, hasta=hasta)
    return [MovimientoOut.model_validate(m) for m in movs]


@router.post("/cajas/{caja_id}/movimientos", response_model=MovimientoOut, status_code=201)
async def registrar_movimiento(
    caja_id: uuid.UUID,
    datos: MovimientoIn,
    session: SessionDep,
    actor: AdminOAnalista,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> MovimientoOut:
    mov = await servicio.movimiento_manual(
        session, caja_id, tipo=datos.tipo, monto=datos.monto,
        fecha_negocio=datos.fecha_negocio, concepto=datos.concepto,
        categoria=datos.categoria, referencia=datos.referencia, actor_id=actor.id,
        idempotency_key=idempotency_key,
    )
    await session.commit()
    return MovimientoOut.model_validate(mov)


@router.get("/cajas/{caja_id}/arqueo-pendiente", response_model=ArqueoPendienteOut)
async def arqueo_pendiente(
    caja_id: uuid.UUID,
    session: SessionDep,
    _: AdminOAnalista,
    fecha_negocio: Annotated[date, Query()],
) -> ArqueoPendienteOut:
    res = await servicio.arqueo_pendiente(session, caja_id, fecha_negocio)
    return ArqueoPendienteOut(**res)


@router.post("/cajas/{caja_id}/arqueo", response_model=ArqueoOut, status_code=201)
async def cerrar_arqueo(
    caja_id: uuid.UUID,
    datos: ArqueoIn,
    session: SessionDep,
    actor: AdminOAnalista,
) -> ArqueoOut:
    arqueo = await servicio.cerrar_arqueo(
        session, caja_id, fecha_negocio=datos.fecha_negocio,
        saldo_fisico=datos.saldo_fisico, actor_id=actor.id,
    )
    await session.commit()
    return ArqueoOut.model_validate(arqueo)


@router.post("/transferencias-internas", response_model=list[MovimientoOut], status_code=201)
async def transferencia_interna(
    datos: TransferenciaIn,
    session: SessionDep,
    actor: AdminOAnalista,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> list[MovimientoOut]:
    if datos.monto <= 0:
        raise ErrorAPI("monto_invalido", "el monto debe ser positivo", status=422)
    egreso, ingreso = await servicio.transferencia_interna(
        session, caja_origen_id=datos.caja_origen_id,
        caja_destino_id=datos.caja_destino_id, monto=datos.monto,
        fecha_negocio=datos.fecha_negocio, concepto=datos.concepto, actor_id=actor.id,
        idempotency_key=idempotency_key,
    )
    await session.commit()
    return [MovimientoOut.model_validate(egreso), MovimientoOut.model_validate(ingreso)]
