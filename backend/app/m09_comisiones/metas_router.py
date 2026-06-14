import uuid
from decimal import ROUND_HALF_UP, Decimal
from typing import Annotated

from fastapi import APIRouter, Depends

from app.deps import SessionDep, requiere_rol
from app.errors import ErrorAPI
from app.m09_comisiones import metas_servicio
from app.m09_comisiones.metas_schemas import MetaVendedorIn, MetaVendedorOut
from app.m12_auth.modelos import Usuario
from nexocred_core import CERO

router = APIRouter(tags=["metas"])

AdminUser = Annotated[Usuario, Depends(requiere_rol("admin"))]
VendedorUser = Annotated[Usuario, Depends(requiere_rol("admin", "vendedor"))]

_CIEN = Decimal("100")


def _es_admin(actor: Usuario) -> bool:
    return any(r.nombre == "admin" for r in actor.roles)


def _exigir_vendedor_propio(actor: Usuario, vendedor_id: uuid.UUID) -> None:
    """Un vendedor solo lee SUS metas; admin exento (mismo criterio que comisiones)."""
    if not _es_admin(actor) and actor.id != vendedor_id:
        raise ErrorAPI("acceso_denegado", "no tenés acceso a estas metas", status=403)


def _porcentaje(colocado: Decimal, meta: Decimal) -> str:
    """Avance en % como string con 1 decimal (sin float). Meta 0 → '0.0'."""
    if meta <= CERO:
        return "0.0"
    pct = (colocado / meta * _CIEN).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
    return f"{pct:f}"


async def _armar_salida(
    session: SessionDep, *, vendedor_id: uuid.UUID, periodo: str
) -> MetaVendedorOut:
    meta = await metas_servicio.obtener_meta(
        session, vendedor_id=vendedor_id, periodo=periodo
    )
    avance = await metas_servicio.calcular_avance(
        session, vendedor_id=vendedor_id, periodo=periodo
    )
    monto_meta = meta.monto_meta if meta is not None else CERO
    return MetaVendedorOut(
        vendedor_id=vendedor_id,
        periodo=periodo,
        monto_meta=monto_meta,
        cantidad_meta=meta.cantidad_meta if meta is not None else None,
        monto_colocado=avance.monto_colocado,
        cantidad_colocada=avance.cantidad_colocada,
        porcentaje_avance=_porcentaje(avance.monto_colocado, monto_meta),
        updated_at=meta.updated_at if meta is not None else None,
    )


@router.get(
    "/vendedores/{vendedor_id}/metas/{periodo}", response_model=MetaVendedorOut
)
async def obtener_meta_periodo(
    vendedor_id: uuid.UUID,
    periodo: str,
    session: SessionDep,
    actor: VendedorUser,
) -> MetaVendedorOut:
    _exigir_vendedor_propio(actor, vendedor_id)
    return await _armar_salida(session, vendedor_id=vendedor_id, periodo=periodo)


@router.put(
    "/vendedores/{vendedor_id}/metas/{periodo}", response_model=MetaVendedorOut
)
async def fijar_meta_periodo(
    vendedor_id: uuid.UUID,
    periodo: str,
    datos: MetaVendedorIn,
    session: SessionDep,
    actor: AdminUser,
) -> MetaVendedorOut:
    await metas_servicio.upsert_meta(
        session,
        vendedor_id=vendedor_id,
        periodo=periodo,
        monto_meta=datos.monto_meta,
        cantidad_meta=datos.cantidad_meta,
    )
    return await _armar_salida(session, vendedor_id=vendedor_id, periodo=periodo)
