import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

from app.tipos import MontoStr


class PagoCreate(BaseModel):
    prestamo_id: uuid.UUID
    monto: MontoStr
    canal: str
    caja_id: uuid.UUID
    fecha_negocio: date


class ImputacionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    concepto: str | None
    monto: MontoStr | None
    orden_waterfall: int | None
    cuota_numero: int | None
    cuota_id: uuid.UUID | None


class PagoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    prestamo_id: uuid.UUID
    monto: MontoStr | None
    excedente: MontoStr
    estado: str
    canal: str | None
    fecha_negocio: date | None
    corrige_pago_id: uuid.UUID | None
    created_at: datetime


class PagoDetalleOut(PagoOut):
    imputaciones: list[ImputacionOut] = []


class CorreccionIn(BaseModel):
    monto: MontoStr
    canal: str | None = None
    caja_id: uuid.UUID
    fecha_negocio: date
    motivo: str | None = None


class CorreccionOut(BaseModel):
    pago_original_id: uuid.UUID
    pago_nuevo_id: uuid.UUID
    estado_original: str
