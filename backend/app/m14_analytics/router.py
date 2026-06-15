from dataclasses import asdict
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.deps import SessionDep, requiere_rol
from app.m12_auth.modelos import Usuario
from app.m14_analytics import servicio
from app.m14_analytics.schemas import RentabilidadItem, ResumenAnalytics
from app.paginacion import Pagina, paginar

router = APIRouter(tags=["analytics"])

AnalyticsUser = Annotated[Usuario, Depends(requiere_rol("admin", "tesoreria"))]

DIMENSIONES = {"producto", "vendedor", "segmento", "cosecha", "zona"}


def _fecha(f: date | None) -> date:
    return f or date.today()


@router.get("/analytics/rentabilidad", response_model=Pagina[RentabilidadItem])
async def get_rentabilidad(
    session: SessionDep,
    _: AnalyticsUser,
    dimension: Annotated[str, Query()] = "producto",
    fecha: Annotated[date | None, Query()] = None,
    desde: Annotated[date | None, Query()] = None,
    hasta: Annotated[date | None, Query()] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
) -> Pagina[RentabilidadItem]:
    dim = dimension if dimension in DIMENSIONES else "producto"
    agregados = await servicio.rentabilidad_por(session, dim, _fecha(fecha), desde, hasta)
    items = [RentabilidadItem(**asdict(a)) for a in agregados]
    return paginar(items, page, per_page)


@router.get("/analytics/resumen", response_model=ResumenAnalytics)
async def get_resumen(
    session: SessionDep,
    _: AnalyticsUser,
    fecha: Annotated[date | None, Query()] = None,
) -> ResumenAnalytics:
    return ResumenAnalytics(**await servicio.resumen_cartera(session, _fecha(fecha)))
