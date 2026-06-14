import uuid
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ErrorAPI
from app.m09_comisiones.metas_modelos import MetaVendedor
from app.modelos_stub import Prestamo
from nexocred_core import CERO, redondear


def _rango_periodo(periodo: str) -> tuple[date, date]:
    """Devuelve [primer_dia, primer_dia_mes_siguiente) para un período 'YYYY-MM'.

    Rango semiabierto: la cota superior es exclusiva, así un desembolso del último
    día del mes (a cualquier hora) cae dentro sin lógica de fin-de-mes.
    """
    try:
        anio_s, mes_s = periodo.split("-")
        anio, mes = int(anio_s), int(mes_s)
        desde = date(anio, mes, 1)
    except (ValueError, IndexError) as exc:
        raise ErrorAPI(
            "periodo_invalido",
            "el período debe tener formato YYYY-MM",
            status=400,
        ) from exc
    if not 1 <= mes <= 12:
        raise ErrorAPI(
            "periodo_invalido", "el mes debe estar entre 01 y 12", status=400
        )
    hasta = date(anio + 1, 1, 1) if mes == 12 else date(anio, mes + 1, 1)
    return desde, hasta


@dataclass(frozen=True)
class AvanceMeta:
    """Avance real de un vendedor en un período, calculado desde los desembolsos."""

    monto_colocado: Decimal
    cantidad_colocada: int


async def calcular_avance(
    session: AsyncSession, *, vendedor_id: uuid.UUID, periodo: str
) -> AvanceMeta:
    """Suma lo realmente colocado (desembolsado) por el vendedor en el período.

    Fuente de verdad: préstamos con fecha_desembolso dentro del mes y vendedor_id
    coincidente. Usa monto_desembolsado y cae a capital si aquél es NULL (préstamos
    históricos). Dinero en Decimal — sin float — y redondeado con el core.
    """
    desde, hasta = _rango_periodo(periodo)
    monto_efectivo = func.coalesce(Prestamo.monto_desembolsado, Prestamo.capital)
    res = await session.execute(
        select(
            func.coalesce(func.sum(monto_efectivo), 0),
            func.count(Prestamo.id),
        ).where(
            Prestamo.vendedor_id == vendedor_id,
            Prestamo.fecha_desembolso.is_not(None),
            Prestamo.fecha_desembolso >= desde,
            Prestamo.fecha_desembolso < hasta,
        )
    )
    suma, cantidad = res.one()
    monto = redondear(Decimal(suma)) if suma is not None else CERO
    return AvanceMeta(monto_colocado=monto, cantidad_colocada=int(cantidad or 0))


async def obtener_meta(
    session: AsyncSession, *, vendedor_id: uuid.UUID, periodo: str
) -> MetaVendedor | None:
    res = await session.execute(
        select(MetaVendedor).where(
            MetaVendedor.vendedor_id == vendedor_id,
            MetaVendedor.periodo == periodo,
        )
    )
    return res.scalar_one_or_none()


async def upsert_meta(
    session: AsyncSession,
    *,
    vendedor_id: uuid.UUID,
    periodo: str,
    monto_meta: Decimal,
    cantidad_meta: int | None,
) -> MetaVendedor:
    """Crea o actualiza la meta del vendedor para el período (idempotente por
    (vendedor_id, periodo))."""
    _rango_periodo(periodo)  # valida formato antes de tocar la DB
    if monto_meta < CERO:
        raise ErrorAPI(
            "monto_meta_invalido", "el monto de la meta no puede ser negativo", status=400
        )
    meta = await obtener_meta(session, vendedor_id=vendedor_id, periodo=periodo)
    if meta is None:
        meta = MetaVendedor(
            vendedor_id=vendedor_id,
            periodo=periodo,
            monto_meta=redondear(monto_meta),
            cantidad_meta=cantidad_meta,
        )
        session.add(meta)
    else:
        meta.monto_meta = redondear(monto_meta)
        meta.cantidad_meta = cantidad_meta
    await session.flush()
    await session.commit()
    return meta
