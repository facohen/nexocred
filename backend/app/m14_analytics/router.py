from dataclasses import asdict
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.deps import SessionDep, requiere_rol
from app.errors import ErrorAPI
from app.m12_auth.modelos import Usuario
from app.m14_analytics import servicio
from app.m14_analytics.schemas import RentabilidadItem, ResumenAnalytics
from app.paginacion import Pagina, paginar

router = APIRouter(tags=["analytics"])

AnalyticsUser = Annotated[Usuario, Depends(requiere_rol("ceo", "administrativo"))]

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
    zona_id: Annotated[str | None, Query()] = None,
    sector_id: Annotated[str | None, Query()] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
) -> Pagina[RentabilidadItem]:
    if dimension not in DIMENSIONES:
        raise ErrorAPI(
            "dimension_invalida",
            f"dimension debe ser una de: {', '.join(sorted(DIMENSIONES))}",
            status=422,
        )
    agregados = await servicio.rentabilidad_por(
        session, dimension, _fecha(fecha), desde, hasta, zona_id, sector_id
    )
    items = [RentabilidadItem(**asdict(a)) for a in agregados]
    return paginar(items, page, per_page)


@router.get("/analytics/resumen", response_model=ResumenAnalytics)
async def get_resumen(
    session: SessionDep,
    _: AnalyticsUser,
    fecha: Annotated[date | None, Query()] = None,
    zona_id: Annotated[str | None, Query()] = None,
    sector_id: Annotated[str | None, Query()] = None,
) -> ResumenAnalytics:
    return ResumenAnalytics(
        **await servicio.resumen_cartera(session, _fecha(fecha), zona_id, sector_id)
    )
