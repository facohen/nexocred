import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Header, Query

from app.deps import Administrativo, CurrentUser, SessionDep, scope_vendedor
from app.errors import ErrorAPI
from app.m03_prestamos import servicio
from app.m03_prestamos.schemas import CancelarIn, CuotaOut, PayoffOut, PrestamoOut
from app.m04_pagos import servicio as pagos
from app.m04_pagos.schemas import ImputacionOut, PagoDetalleOut, PagoOut
from app.m06_novaciones import servicio as novaciones
from app.m06_novaciones.schemas import NovacionOut
from app.paginacion import Pagina, paginar

router = APIRouter(tags=["prestamos"])


def _exigir_idem(idempotency_key: str | None) -> str:
    if not idempotency_key:
        raise ErrorAPI(
            "idempotency_key_requerida",
            "esta operacion requiere header Idempotency-Key",
            status=400,
        )
    return idempotency_key


async def _get_prestamo(session, prestamo_id: uuid.UUID):
    p = await servicio.obtener_prestamo(session, prestamo_id)
    if p is None:
        raise ErrorAPI("prestamo_no_encontrado", "prestamo inexistente", status=404)
    return p


@router.get("/prestamos", response_model=Pagina[PrestamoOut])
async def listar_prestamos(
    session: SessionDep,
    actor: CurrentUser,
    estado: Annotated[str | None, Query()] = None,
    persona_id: Annotated[uuid.UUID | None, Query()] = None,
    producto_id: Annotated[uuid.UUID | None, Query()] = None,
    vendedor_id: Annotated[uuid.UUID | None, Query()] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
) -> Pagina[PrestamoOut]:
    # Scope por vendedor: un vendedor puro solo ve sus préstamos; los roles de
    # lectura global ven todo o filtran libremente vía ?vendedor_id.
    filtro_vendedor = scope_vendedor(actor, vendedor_id)
    prestamos = await servicio.listar_prestamos(
        session, estado=estado, persona_id=persona_id, producto_id=producto_id,
        vendedor_id=filtro_vendedor,
    )
    return paginar([PrestamoOut.model_validate(p) for p in prestamos], page, per_page)


@router.get("/prestamos/{prestamo_id}", response_model=PrestamoOut)
async def detalle_prestamo(
    prestamo_id: uuid.UUID, session: SessionDep, _: CurrentUser
) -> PrestamoOut:
    return PrestamoOut.model_validate(await _get_prestamo(session, prestamo_id))


@router.get("/prestamos/{prestamo_id}/cuotas", response_model=list[CuotaOut])
async def cuotas_prestamo(
    prestamo_id: uuid.UUID, session: SessionDep, _: CurrentUser
) -> list[CuotaOut]:
    await _get_prestamo(session, prestamo_id)
    cuotas = await servicio.cuotas_de(session, prestamo_id)
    return [CuotaOut.model_validate(c) for c in cuotas]


@router.get("/prestamos/{prestamo_id}/pagos", response_model=list[PagoDetalleOut])
async def pagos_prestamo(
    prestamo_id: uuid.UUID, session: SessionDep, _: CurrentUser
) -> list[PagoDetalleOut]:
    await _get_prestamo(session, prestamo_id)
    lista = await pagos.pagos_de_prestamo(session, prestamo_id)
    salida: list[PagoDetalleOut] = []
    for p in lista:
        out = PagoDetalleOut.model_validate(p)
        imps = await pagos.imputaciones_de_pago(session, p.id)
        out.imputaciones = [ImputacionOut.model_validate(i) for i in imps]
        salida.append(out)
    return salida


@router.get("/prestamos/{prestamo_id}/payoff", response_model=PayoffOut)
async def payoff_prestamo(
    prestamo_id: uuid.UUID,
    session: SessionDep,
    _: CurrentUser,
    fecha_negocio: Annotated[date, Query()],
) -> PayoffOut:
    prestamo = await _get_prestamo(session, prestamo_id)
    res = await servicio.payoff(session, prestamo, fecha_negocio)
    return PayoffOut(
        fecha_negocio=res.fecha_negocio,
        capital=res.capital,
        interes=res.interes,
        punitorio=res.punitorio,
        total=res.total,
    )


@router.get("/prestamos/{prestamo_id}/novaciones", response_model=list[NovacionOut])
async def novaciones_prestamo(
    prestamo_id: uuid.UUID, session: SessionDep, _: CurrentUser
) -> list[NovacionOut]:
    await _get_prestamo(session, prestamo_id)
    lista = await novaciones.novaciones_de_prestamo(session, prestamo_id)
    return [NovacionOut.model_validate(n) for n in lista]


@router.post("/prestamos/{prestamo_id}/cancelar", response_model=PagoOut, status_code=201)
async def cancelar_prestamo(
    prestamo_id: uuid.UUID,
    datos: CancelarIn,
    session: SessionDep,
    actor: Administrativo,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> PagoOut:
    clave = _exigir_idem(idempotency_key)
    return await servicio.cancelar(
        session,
        prestamo_id=prestamo_id,
        caja_id=datos.caja_id,
        fecha_negocio=datos.fecha_negocio,
        canal=datos.canal,
        idempotency_key=clave,
        actor_id=actor.id,
    )
