"""Sobre de paginación uniforme para los listados de la API.

Todos los GET de colección devuelven `{data, total, page, per_page}` — el mismo
contrato que el frontend ya consume para /personas. Antes 22 listados devolvían
una lista cruda `[...]`, lo que obligaba al cliente a manejar dos formas; este
helper unifica el contrato.
"""

from typing import Annotated

from fastapi import Query
from pydantic import BaseModel


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
