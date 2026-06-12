import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

from app.tipos import MontoStr


class CajaCreate(BaseModel):
    nombre: str
    tipo: str | None = None


class CajaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    nombre: str
    tipo: str | None
    saldo_teorico: MontoStr
    activo: bool


class MovimientoIn(BaseModel):
    tipo: str  # 'ingreso' | 'egreso'
    monto: MontoStr
    fecha_negocio: date
    concepto: str | None = None
    categoria: str | None = None
    referencia: str | None = None


class MovimientoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    caja_id: uuid.UUID | None
    tipo: str | None
    monto: MontoStr | None
    fecha_negocio: date | None
    concepto: str | None
    categoria: str | None
    contraparte_caja_id: uuid.UUID | None
    pago_id: uuid.UUID | None
    referencia: str | None
    created_at: datetime


class TransferenciaIn(BaseModel):
    caja_origen_id: uuid.UUID
    caja_destino_id: uuid.UUID
    monto: MontoStr
    fecha_negocio: date
    concepto: str | None = None


class ArqueoIn(BaseModel):
    fecha_negocio: date
    saldo_fisico: MontoStr


class ArqueoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    caja_id: uuid.UUID
    fecha_negocio: date
    saldo_teorico: MontoStr
    saldo_fisico: MontoStr
    diferencia: MontoStr


class ArqueoPendienteOut(BaseModel):
    caja_id: uuid.UUID
    fecha_negocio: date
    saldo_teorico: MontoStr
    cerrado: bool


class PosicionConsolidadaOut(BaseModel):
    total: MontoStr
    cajas: list[CajaOut]
