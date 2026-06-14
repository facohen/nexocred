"""Sobre de paginación uniforme para los listados de la API.

Todos los GET de colección devuelven `{data, total, page, per_page}` — el mismo
contrato que el frontend ya consume para /personas. Antes 22 listados devolvían
una lista cruda `[...]`, lo que obligaba al cliente a manejar dos formas; este
helper unifica el contrato.
"""

from collections.abc import Callable
from typing import Annotated

from fastapi import Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import Select


class Pagina[T](BaseModel):
    """Sobre paginado genérico. `Pagina[CajaOut]` tipa el response_model."""

    data: list[T]
    total: int
    page: int
    per_page: int


# Parámetros de query estándar para listados, reutilizables como dependencias.
PageParam = Annotated[int, Query(ge=1)]
PerPageParam = Annotated[int, Query(ge=1, le=200)]


def paginar[T](items: list[T], page: int = 1, per_page: int = 50) -> Pagina[T]:
    """Envuelve una lista YA materializada en el sobre paginado.

    Para listados que hoy traen todo de una (catálogos, dashboards de cartera
    acotada), pagina en memoria. Endpoints con volumen real deberían paginar en
    la query SQL y pasar `total` explícito vía `Pagina(...)` directo.
    """
    total = len(items)
    inicio = (page - 1) * per_page
    return Pagina[T](
        data=items[inicio : inicio + per_page],
        total=total,
        page=page,
        per_page=per_page,
    )


async def paginar_query[E, T](
    session: AsyncSession,
    query: Select,
    serializar: Callable[[E], T],
    page: int = 1,
    per_page: int = 50,
) -> Pagina[T]:
    """Pagina EN SQL (COUNT + LIMIT/OFFSET): no materializa la tabla entera.

    Para tablas que crecen sin techo (auditoría, pagos, movimientos, préstamos).
    `query` es un `select(Entidad)` sin limit/offset; `serializar` mapea cada fila
    ORM al schema de salida. El `total` se calcula con un COUNT sobre el mismo
    filtro, sin traer las filas.
    """
    total = await session.scalar(select(func.count()).select_from(query.subquery()))
    offset = (page - 1) * per_page
    res = await session.execute(query.limit(per_page).offset(offset))
    filas = res.scalars().all()
    return Pagina[T](
        data=[serializar(e) for e in filas],
        total=int(total or 0),
        page=page,
        per_page=per_page,
    )
