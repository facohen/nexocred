import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query

from app.deps import SessionDep, requiere_rol
from app.errors import ErrorAPI
from app.m09_comisiones import servicio
from app.m09_comisiones.schemas import (
    ClawbackIn,
    ComisionDevengoOut,
    GenerarLiquidacionIn,
    LiquidacionDetalladaOut,
    LiquidacionDetalleOut,
    LiquidacionOut,
    PagarLiquidacionIn,
)
from app.m12_auth.modelos import Usuario
from app.paginacion import Pagina, paginar

router = APIRouter(tags=["comisiones"])

AdminUser = Annotated[Usuario, Depends(requiere_rol("administrativo"))]
VendedorUser = Annotated[Usuario, Depends(requiere_rol("vendedor", "administrativo"))]


def _es_admin(actor: Usuario) -> bool:
    """Check if actor has admin role."""
    return any(r.nombre == "administrativo" for r in actor.roles)


def _exigir_vendedor_propio(actor: Usuario, vendedor_id: uuid.UUID) -> None:
    """Ownership (spec §5.11): un vendedor solo accede a SUS comisiones.

    Admin exento; cualquier otro rol debe coincidir con vendedor_id o 403.
    """
    if not _es_admin(actor) and actor.id != vendedor_id:
        raise ErrorAPI(
            "acceso_denegado", "no tenés acceso a estas comisiones", status=403
        )


def _exigir_idem(idempotency_key: str | None) -> str:
    if not idempotency_key:
        raise ErrorAPI(
            "idempotency_key_requerida",
            "esta operacion requiere header Idempotency-Key",
            status=400,
        )
    return idempotency_key


# ---------- Devengo / portal vendedor ----------
@router.get(
    "/vendedores/{vendedor_id}/comisiones", response_model=list[ComisionDevengoOut]
)
async def comisiones_vendedor(
    vendedor_id: uuid.UUID,
    session: SessionDep,
    actor: VendedorUser,
    estado: Annotated[str | None, Query()] = None,
) -> list[ComisionDevengoOut]:
    _exigir_vendedor_propio(actor, vendedor_id)
    devengos = await servicio.comisiones_de_vendedor(
        session, vendedor_id, estado=estado
    )
    return [ComisionDevengoOut.model_validate(d) for d in devengos]


@router.get(
    "/comisiones/devengo/{prestamo_id}", response_model=list[ComisionDevengoOut]
)
async def comisiones_prestamo(
    prestamo_id: uuid.UUID, session: SessionDep, actor: VendedorUser
) -> list[ComisionDevengoOut]:
    # Ownership (spec §5.11): non-admin solo ve comisiones de préstamos que
    # él mismo originó (prestamo.vendedor_id == actor.id). Admin exento.
    if not _es_admin(actor):
        from app.m03_prestamos.servicio import obtener_prestamo

        prestamo = await obtener_prestamo(session, prestamo_id)
        if prestamo is None or prestamo.vendedor_id != actor.id:
            raise ErrorAPI(
                "acceso_denegado", "no tenés acceso a estas comisiones", status=403
            )
    devengos = await servicio.comisiones_de_prestamo(session, prestamo_id)
    return [ComisionDevengoOut.model_validate(d) for d in devengos]


@router.post("/comisiones/clawback", response_model=ComisionDevengoOut, status_code=201)
async def crear_clawback(
    datos: ClawbackIn, session: SessionDep, actor: AdminUser
) -> ComisionDevengoOut:
    reverso = await servicio.clawback(
        session, prestamo_id=datos.prestamo_id, motivo=datos.motivo, actor_id=actor.id
    )
    return ComisionDevengoOut.model_validate(reverso)


@router.get("/vendedores/{vendedor_id}/cartera")
async def cartera_vendedor(
    vendedor_id: uuid.UUID, session: SessionDep, actor: VendedorUser
) -> dict:
    _exigir_vendedor_propio(actor, vendedor_id)
    devengos = await servicio.comisiones_de_vendedor(session, vendedor_id)
    return {
        "vendedor_id": str(vendedor_id),
        "comisiones": len(devengos),
        "devengadas": sum(1 for d in devengos if d.estado == "devengada"),
        "liquidadas": sum(1 for d in devengos if d.estado == "liquidada"),
    }


@router.get("/vendedores/{vendedor_id}/pipeline")
async def pipeline_vendedor(
    vendedor_id: uuid.UUID, session: SessionDep, actor: VendedorUser
) -> dict:
    _exigir_vendedor_propio(actor, vendedor_id)
    devengos = await servicio.comisiones_de_vendedor(session, vendedor_id)
    por_estado: dict[str, int] = {}
    for d in devengos:
        por_estado[d.estado] = por_estado.get(d.estado, 0) + 1
    return {"vendedor_id": str(vendedor_id), "por_estado": por_estado}


# ---------- Liquidaciones ----------
@router.get("/comisiones/liquidaciones", response_model=Pagina[LiquidacionOut])
async def listar_liquidaciones(
    session: SessionDep,
    actor: VendedorUser,
    vendedor_id: Annotated[uuid.UUID | None, Query()] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
) -> Pagina[LiquidacionOut]:
    # Ownership (spec §5.11): non-admin solo ve sus propias liquidaciones.
    if not _es_admin(actor):
        vendedor_id = actor.id
    liqs = await servicio.listar_liquidaciones(session, vendedor_id=vendedor_id)
    return paginar([LiquidacionOut.model_validate(liq) for liq in liqs], page, per_page)


@router.post(
    "/comisiones/liquidaciones", response_model=LiquidacionDetalladaOut, status_code=201
)
async def generar_liquidacion(
    datos: GenerarLiquidacionIn, session: SessionDep, actor: AdminUser
) -> LiquidacionDetalladaOut:
    liq = await servicio.generar_liquidacion(
        session, vendedor_id=datos.vendedor_id, periodo_desde=datos.periodo_desde,
        periodo_hasta=datos.periodo_hasta, actor_id=actor.id,
    )
    detalle = await servicio.detalle_liquidacion(session, liq.id)
    return LiquidacionDetalladaOut(
        **LiquidacionOut.model_validate(liq).model_dump(mode="python"),
        detalle=[LiquidacionDetalleOut.model_validate(d) for d in detalle],
    )


async def _get_liquidacion(session, liquidacion_id: uuid.UUID):
    liq = await servicio.obtener_liquidacion(session, liquidacion_id)
    if liq is None:
        raise ErrorAPI("liquidacion_no_encontrada", "liquidacion inexistente", status=404)
    return liq


@router.get(
    "/comisiones/liquidaciones/{liquidacion_id}",
    response_model=LiquidacionDetalladaOut,
)
async def detalle_liquidacion(
    liquidacion_id: uuid.UUID, session: SessionDep, actor: VendedorUser
) -> LiquidacionDetalladaOut:
    liq = await _get_liquidacion(session, liquidacion_id)
    _exigir_vendedor_propio(actor, liq.vendedor_id)
    detalle = await servicio.detalle_liquidacion(session, liq.id)
    return LiquidacionDetalladaOut(
        **LiquidacionOut.model_validate(liq).model_dump(mode="python"),
        detalle=[LiquidacionDetalleOut.model_validate(d) for d in detalle],
    )


@router.patch(
    "/comisiones/liquidaciones/{liquidacion_id}/aprobar",
    response_model=LiquidacionOut,
)
async def aprobar_liquidacion(
    liquidacion_id: uuid.UUID, session: SessionDep, actor: AdminUser
) -> LiquidacionOut:
    liq = await _get_liquidacion(session, liquidacion_id)
    liq = await servicio.aprobar_liquidacion(session, liquidacion=liq, actor_id=actor.id)
    return LiquidacionOut.model_validate(liq)


@router.post(
    "/comisiones/liquidaciones/{liquidacion_id}/pagar", response_model=LiquidacionOut
)
async def pagar_liquidacion(
    liquidacion_id: uuid.UUID,
    datos: PagarLiquidacionIn,
    session: SessionDep,
    actor: AdminUser,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> LiquidacionOut:
    clave = _exigir_idem(idempotency_key)
    liq = await servicio.pagar_liquidacion(
        session, liquidacion_id=liquidacion_id, caja_id=datos.caja_id,
        fecha_negocio=datos.fecha_negocio, idempotency_key=clave, actor_id=actor.id,
    )
    return LiquidacionOut.model_validate(liq)
