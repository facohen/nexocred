from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.deps import SessionDep, requiere_rol
from app.m11_torre import servicio
from app.m11_torre.schemas import (
    AlertasLiveOut,
    NegocioOut,
    OperacionHoyOut,
    PulsoOut,
    ResumenOut,
    SaludCarteraOut,
)
from app.m12_auth.modelos import Usuario

router = APIRouter(tags=["torre"])

TorreUser = Annotated[Usuario, Depends(requiere_rol("admin", "tesoreria"))]


def _fecha(f: date | None) -> date:
    return f or date.today()


@router.get("/torre/resumen", response_model=ResumenOut)
async def get_resumen(session: SessionDep, _: TorreUser) -> ResumenOut:
    return ResumenOut(**await servicio.resumen(session))


@router.get("/torre/pulso", response_model=PulsoOut)
async def get_pulso(session: SessionDep, _: TorreUser) -> PulsoOut:
    return PulsoOut(**await servicio.pulso(session))


@router.get("/torre/salud-cartera", response_model=SaludCarteraOut)
async def get_salud(
    session: SessionDep, _: TorreUser,
    fecha: Annotated[date | None, Query()] = None,
) -> SaludCarteraOut:
    return SaludCarteraOut(**await servicio.salud_cartera(session, _fecha(fecha)))


@router.get("/torre/operacion-hoy", response_model=OperacionHoyOut)
async def get_operacion(
    session: SessionDep, _: TorreUser,
    fecha: Annotated[date | None, Query()] = None,
) -> OperacionHoyOut:
    return OperacionHoyOut(**await servicio.operacion_hoy(session, _fecha(fecha)))


@router.get("/torre/negocio", response_model=NegocioOut)
async def get_negocio(
    session: SessionDep, _: TorreUser,
    fecha: Annotated[date | None, Query()] = None,
) -> NegocioOut:
    return NegocioOut(**await servicio.negocio(session, _fecha(fecha)))


@router.get("/torre/alertas-live", response_model=AlertasLiveOut)
async def get_alertas_live(session: SessionDep, _: TorreUser) -> AlertasLiveOut:
    return AlertasLiveOut(**await servicio.alertas_live(session))
