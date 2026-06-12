import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

from app.tipos import MontoStr, TasaStr


class PrestamoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    persona_id: uuid.UUID
    producto_id: uuid.UUID
    solicitud_id: uuid.UUID | None
    capital: MontoStr | None
    estado: str
    fecha_desembolso: date | None
    tasa_punitorio_diario: TasaStr
    monto_desembolsado: MontoStr | None
    snapshot_terminos: dict | None
    created_at: datetime


class CuotaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    numero: int
    vencimiento: date | None
    capital: MontoStr | None
    interes: MontoStr | None
    cuota: MontoStr | None
    punitorio_acumulado: MontoStr
    estado: str


class PayoffOut(BaseModel):
    fecha_negocio: date
    capital: MontoStr
    interes: MontoStr
    punitorio: MontoStr
    total: MontoStr


class CancelarIn(BaseModel):
    caja_id: uuid.UUID
    fecha_negocio: date
    canal: str = "mostrador"
