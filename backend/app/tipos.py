"""Tipos compartidos para serializacion de dominio.

`MontoStr`: Decimal monetario que en JSON entra y sale como string con 2 decimales
(spec §5.2: nunca float en dinero). `TasaStr`: para tasas/porcentajes con escala mayor.
"""

from decimal import Decimal
from typing import Annotated

from pydantic import BeforeValidator, PlainSerializer

from nexocred_core import redondear


def _a_decimal(v: object) -> Decimal:
    if isinstance(v, Decimal):
        return v
    if isinstance(v, float):
        raise ValueError("dinero no puede ser float; usar string o Decimal")
    return Decimal(str(v))


MontoStr = Annotated[
    Decimal,
    BeforeValidator(_a_decimal),
    PlainSerializer(lambda v: f"{redondear(v):.2f}", return_type=str),
]


def _tasa_decimal(v: object) -> Decimal:
    if isinstance(v, Decimal):
        return v
    if isinstance(v, float):
        raise ValueError("tasa no puede ser float; usar string o Decimal")
    return Decimal(str(v))


TasaStr = Annotated[
    Decimal,
    BeforeValidator(_tasa_decimal),
    PlainSerializer(lambda v: f"{v:.4f}", return_type=str),
]
