from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query

from app.deps import SessionDep, requiere_rol
from app.m10_tesoreria import servicio
from app.m10_tesoreria.schemas import (
    AporteRetiroIn,
    AporteRetiroOut,
    CashflowOut,
    DCFOut,
    PosicionOut,
    RotacionOut,
)
from app.m12_auth.modelos import Usuario

router = APIRouter(tags=["tesoreria"])

TesoreriaUser = Annotated[Usuario, Depends(requiere_rol("admin", "tesoreria"))]


def _fecha(f: date | None) -> date:
    return f or date.today()


@router.get("/tesoreria/posicion", response_model=PosicionOut)
async def get_posicion(
    session: SessionDep,
    _: TesoreriaUser,
    fecha: Annotated[date | None, Query()] = None,
) -> PosicionOut:
    return PosicionOut(**await servicio.posicion(session, _fecha(fecha)))


@router.get("/tesoreria/cashflow", response_model=CashflowOut)
async def get_cashflow(
    session: SessionDep,
    _: TesoreriaUser,
    dias: Annotated[int, Query()] = 90,
    fecha: Annotated[date | None, Query()] = None,
) -> CashflowOut:
    return CashflowOut(**await servicio.cashflow(session, _fecha(fecha), dias))


@router.get("/tesoreria/dcf", response_model=DCFOut)
async def get_dcf(
    session: SessionDep,
    _: TesoreriaUser,
    fecha: Annotated[date | None, Query()] = None,
) -> DCFOut:
    return DCFOut(**await servicio.dcf(session, _fecha(fecha)))


@router.get("/tesoreria/rotacion", response_model=RotacionOut)
async def get_rotacion(
    session: SessionDep,
    _: TesoreriaUser,
    fecha: Annotated[date | None, Query()] = None,
) -> RotacionOut:
    return RotacionOut(**await servicio.rotacion(session, _fecha(fecha)))


@router.post("/tesoreria/aportes", response_model=AporteRetiroOut, status_code=201)
async def post_aporte(
    datos: AporteRetiroIn,
    session: SessionDep,
    actor: TesoreriaUser,
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> AporteRetiroOut:
    fila = await servicio.registrar_aporte(
        session, datos, actor_id=actor.id, idempotency_key=idempotency_key
    )
    return AporteRetiroOut.model_validate(fila)


@router.post("/tesoreria/retiros", response_model=AporteRetiroOut, status_code=201)
async def post_retiro(
    datos: AporteRetiroIn,
    session: SessionDep,
    actor: TesoreriaUser,
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> AporteRetiroOut:
    fila = await servicio.registrar_retiro(
        session, datos, actor_id=actor.id, idempotency_key=idempotency_key
    )
    return AporteRetiroOut.model_validate(fila)


@router.get("/tesoreria/aportes-retiros", response_model=list[AporteRetiroOut])
async def get_aportes_retiros(
    session: SessionDep, _: TesoreriaUser
) -> list[AporteRetiroOut]:
    filas = await servicio.listar_aportes_retiros(session)
    return [AporteRetiroOut.model_validate(f) for f in filas]
