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
from app.paginacion import Pagina, paginar

router = APIRouter(tags=["tesoreria"])

# Escritura (aportes/retiros): solo administrativo.
TesoreriaUser = Annotated[Usuario, Depends(requiere_rol("administrativo"))]
# Lectura (posición/cashflow/dcf/rotación): administrativo opera + ceo lo ve como
# dashboard ejecutivo (read-only).
TesoreriaLectura = Annotated[Usuario, Depends(requiere_rol("administrativo", "ceo"))]


def _fecha(f: date | None) -> date:
    return f or date.today()


@router.get("/tesoreria/posicion", response_model=PosicionOut)
async def get_posicion(
    session: SessionDep,
    _: TesoreriaLectura,
    fecha: Annotated[date | None, Query()] = None,
) -> PosicionOut:
    return PosicionOut(**await servicio.posicion(session, _fecha(fecha)))


@router.get("/tesoreria/cashflow", response_model=CashflowOut)
async def get_cashflow(
    session: SessionDep,
    _: TesoreriaLectura,
    dias: Annotated[int, Query()] = 90,
    fecha: Annotated[date | None, Query()] = None,
    horizontes: Annotated[
        str | None,
        Query(description="Horizontes en meses separados por coma, ej '3,6,12,24,36'"),
    ] = None,
) -> CashflowOut:
    meses = None
    if horizontes:
        meses = [int(h) for h in horizontes.split(",") if h.strip().isdigit()]
    return CashflowOut(
        **await servicio.cashflow(session, _fecha(fecha), dias, horizontes_meses=meses)
    )


@router.get("/tesoreria/dcf", response_model=DCFOut)
async def get_dcf(
    session: SessionDep,
    _: TesoreriaLectura,
    fecha: Annotated[date | None, Query()] = None,
) -> DCFOut:
    return DCFOut(**await servicio.dcf(session, _fecha(fecha)))


@router.get("/tesoreria/rotacion", response_model=RotacionOut)
async def get_rotacion(
    session: SessionDep,
    _: TesoreriaLectura,
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


@router.get("/tesoreria/aportes-retiros", response_model=Pagina[AporteRetiroOut])
async def get_aportes_retiros(
    session: SessionDep,
    _: TesoreriaLectura,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
) -> Pagina[AporteRetiroOut]:
    filas = await servicio.listar_aportes_retiros(session)
    return paginar([AporteRetiroOut.model_validate(f) for f in filas], page, per_page)
