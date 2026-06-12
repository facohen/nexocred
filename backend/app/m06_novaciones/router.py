import uuid

from fastapi import APIRouter, Header

from app.deps import AdminOAnalista, CurrentUser, SessionDep
from app.errors import ErrorAPI
from app.m06_novaciones import servicio
from app.m06_novaciones.schemas import (
    ConsolidarIn,
    NovacionDetalleOut,
    NovacionOut,
    RefinanciarIn,
    RepactarRapidoIn,
    TransferirIn,
)

router = APIRouter(tags=["novaciones"])


def _exigir_idem(idempotency_key: str | None) -> str:
    if not idempotency_key:
        raise ErrorAPI(
            "idempotency_key_requerida",
            "esta operacion requiere header Idempotency-Key",
            status=400,
        )
    return idempotency_key


@router.post("/novaciones/refinanciar", response_model=NovacionOut, status_code=201)
async def refinanciar(
    datos: RefinanciarIn,
    session: SessionDep,
    actor: AdminOAnalista,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> NovacionOut:
    clave = _exigir_idem(idempotency_key)
    return await servicio.refinanciar(
        session, prestamo_id=datos.prestamo_id, caja_id=datos.caja_id,
        fecha_negocio=datos.fecha_negocio, tasa=datos.tasa_interes_directo,
        cantidad_cuotas=datos.cantidad_cuotas, periodicidad=datos.periodicidad,
        fecha_primera_cuota=datos.fecha_primera_cuota, idempotency_key=clave,
        actor_id=actor.id,
    )


@router.post("/novaciones/consolidar", response_model=NovacionOut, status_code=201)
async def consolidar(
    datos: ConsolidarIn,
    session: SessionDep,
    actor: AdminOAnalista,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> NovacionOut:
    clave = _exigir_idem(idempotency_key)
    return await servicio.consolidar(
        session, prestamo_ids=datos.prestamo_ids, caja_id=datos.caja_id,
        fecha_negocio=datos.fecha_negocio, tasa=datos.tasa_interes_directo,
        cantidad_cuotas=datos.cantidad_cuotas, periodicidad=datos.periodicidad,
        fecha_primera_cuota=datos.fecha_primera_cuota, idempotency_key=clave,
        actor_id=actor.id,
    )


@router.post("/novaciones/transferir", response_model=NovacionOut, status_code=201)
async def transferir(
    datos: TransferirIn,
    session: SessionDep,
    actor: AdminOAnalista,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> NovacionOut:
    clave = _exigir_idem(idempotency_key)
    return await servicio.transferir(
        session, prestamo_id=datos.prestamo_id, nuevo_deudor_id=datos.nuevo_deudor_id,
        caja_id=datos.caja_id, fecha_negocio=datos.fecha_negocio,
        tasa=datos.tasa_interes_directo, cantidad_cuotas=datos.cantidad_cuotas,
        periodicidad=datos.periodicidad, fecha_primera_cuota=datos.fecha_primera_cuota,
        idempotency_key=clave, actor_id=actor.id,
    )


@router.post("/novaciones/repactar-rapido", response_model=NovacionOut, status_code=201)
async def repactar_rapido(
    datos: RepactarRapidoIn,
    session: SessionDep,
    actor: AdminOAnalista,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> NovacionOut:
    clave = _exigir_idem(idempotency_key)
    return await servicio.repactar_rapido(
        session, prestamo_id=datos.prestamo_id, caja_id=datos.caja_id,
        fecha_negocio=datos.fecha_negocio, pago_cuenta=datos.pago_cuenta,
        nueva_cuota=datos.nueva_cuota, tasa=datos.tasa_interes_directo,
        periodicidad=datos.periodicidad, fecha_primera_cuota=datos.fecha_primera_cuota,
        idempotency_key=clave, actor_id=actor.id,
    )


@router.get("/novaciones/{novacion_id}", response_model=NovacionDetalleOut)
async def detalle_novacion(
    novacion_id: uuid.UUID, session: SessionDep, _: CurrentUser
) -> NovacionDetalleOut:
    nov = await servicio.obtener_novacion(session, novacion_id)
    if nov is None:
        raise ErrorAPI("novacion_no_encontrada", "novacion inexistente", status=404)
    out = NovacionDetalleOut.model_validate(nov)
    out.origenes = await servicio.origenes_de(session, novacion_id)
    return out
