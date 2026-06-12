import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.tipos import MontoStr, TasaStr


class TableroOut(BaseModel):
    par30: TasaStr
    par60: TasaStr
    par90: TasaStr
    aging: dict[str, MontoStr]
    porcentaje_refinanciado: TasaStr
    perdida_esperada: MontoStr
    cartera_total: MontoStr


class CosechaOut(BaseModel):
    mes: str
    capital: MontoStr
    mora: MontoStr
    ratio_mora: TasaStr


class ConcentracionItem(BaseModel):
    clave: str
    valor: str
    share: TasaStr


class AlertaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    prestamo_id: uuid.UUID | None
    persona_id: uuid.UUID | None
    tipo: str | None
    estado: str
    severidad: str | None
    metrica: str | None
    valor: float | None
    operador_id: uuid.UUID | None
    tarea_id: uuid.UUID | None
    resuelta_en: datetime | None
    justificacion: str | None


class ResolverAlertaIn(BaseModel):
    justificacion: str


class AsignarAlertaIn(BaseModel):
    operador_id: uuid.UUID


class ProcesarOut(BaseModel):
    creadas: int
    existentes: int
