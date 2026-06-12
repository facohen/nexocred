import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.tipos import MontoStr, TasaStr


class RefinanciarIn(BaseModel):
    prestamo_id: uuid.UUID
    caja_id: uuid.UUID
    fecha_negocio: date
    tasa_interes_directo: TasaStr
    cantidad_cuotas: int = Field(gt=0)
    fecha_primera_cuota: date
    periodicidad: str = "mensual"


class ConsolidarIn(BaseModel):
    prestamo_ids: list[uuid.UUID] = Field(min_length=1)
    caja_id: uuid.UUID
    fecha_negocio: date
    tasa_interes_directo: TasaStr
    cantidad_cuotas: int = Field(gt=0)
    fecha_primera_cuota: date
    periodicidad: str = "mensual"


class TransferirIn(BaseModel):
    prestamo_id: uuid.UUID
    nuevo_deudor_id: uuid.UUID
    caja_id: uuid.UUID
    fecha_negocio: date
    cantidad_cuotas: int = Field(gt=0)
    fecha_primera_cuota: date
    tasa_interes_directo: TasaStr | None = None
    periodicidad: str = "mensual"


class RepactarRapidoIn(BaseModel):
    prestamo_id: uuid.UUID
    caja_id: uuid.UUID
    fecha_negocio: date
    pago_cuenta: MontoStr
    nueva_cuota: MontoStr
    periodicidad: str = "mensual"
    tasa_interes_directo: TasaStr
    fecha_primera_cuota: date


class NovacionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    tipo: str
    estado: str
    nuevo_prestamo_id: uuid.UUID | None
    created_at: datetime


class NovacionDetalleOut(NovacionOut):
    origenes: list[uuid.UUID] = []
