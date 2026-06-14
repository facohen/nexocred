import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.tipos import MontoStr


class MetaVendedorIn(BaseModel):
    """Payload para crear/actualizar la meta de un período (PUT idempotente)."""

    monto_meta: MontoStr
    cantidad_meta: int | None = Field(default=None, ge=0)


class MetaVendedorOut(BaseModel):
    """Meta del período + avance real calculado desde los desembolsos.

    `monto_colocado` / `cantidad_colocada` son derivados (no persistidos);
    `porcentaje_avance` se entrega como métrica string para no exponer floats.
    """

    model_config = ConfigDict(from_attributes=True)

    vendedor_id: uuid.UUID
    periodo: str
    monto_meta: MontoStr
    cantidad_meta: int | None
    monto_colocado: MontoStr
    cantidad_colocada: int
    porcentaje_avance: str
    updated_at: datetime | None
