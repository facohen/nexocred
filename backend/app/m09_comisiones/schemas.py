import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

from app.tipos import MontoStr, TasaStr


class ComisionDevengoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    prestamo_id: uuid.UUID
    vendedor_id: uuid.UUID | None
    monto: MontoStr | None
    estado: str
    tipo: str | None
    porcentaje: TasaStr | None
    clawback_de_id: uuid.UUID | None


class ClawbackIn(BaseModel):
    prestamo_id: uuid.UUID
    motivo: str | None = None


class GenerarLiquidacionIn(BaseModel):
    vendedor_id: uuid.UUID
    periodo_desde: date
    periodo_hasta: date


class LiquidacionDetalleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    comision_devengo_id: uuid.UUID
    monto: MontoStr


class LiquidacionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    vendedor_id: uuid.UUID
    periodo_desde: date
    periodo_hasta: date
    monto_total: MontoStr
    estado: str
    egreso_id: uuid.UUID | None
    aprobada_en: datetime | None


class LiquidacionDetalladaOut(LiquidacionOut):
    detalle: list[LiquidacionDetalleOut]


class PagarLiquidacionIn(BaseModel):
    caja_id: uuid.UUID
    fecha_negocio: date | None = None
