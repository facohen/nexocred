from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Protocol


@dataclass(frozen=True)
class DeudaBcraNormalizada:
    entidad: str
    monto: Decimal
    situacion: int  # 1..6 (clasificacion BCRA)
    fecha_informe: date


class BcraClient(Protocol):
    async def consultar(self, cuil: str) -> list[DeudaBcraNormalizada]:
        """Consulta la deuda registrada en BCRA para un CUIL y la devuelve normalizada."""
        ...
