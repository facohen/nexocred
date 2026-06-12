import uuid
from datetime import date

from pydantic import BaseModel, ConfigDict

from app.tipos import MontoStr, TasaStr


class PosicionOut(BaseModel):
    capital_disponible: MontoStr
    capital_colocado: MontoStr
    utilizacion: TasaStr
    semaforo: str  # 'verde' | 'amarillo' | 'rojo'


class CashflowTramo(BaseModel):
    dias: int
    entradas: MontoStr
    egresos: MontoStr
    neto: MontoStr


class CashflowOut(BaseModel):
    tramos: list[CashflowTramo]


class DCFEscenario(BaseModel):
    escenario: str
    tasa_mensual: TasaStr
    valor_presente: MontoStr


class DCFOut(BaseModel):
    flujos_nominales: MontoStr
    escenarios: list[DCFEscenario]


class RotacionOut(BaseModel):
    colocacion_periodo: MontoStr
    capital_promedio: MontoStr
    rotacion_anualizada: TasaStr


class AporteRetiroIn(BaseModel):
    monto: MontoStr
    fecha_negocio: date
    caja_id: uuid.UUID
    inversor: str | None = None
    nota: str | None = None


class AporteRetiroOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tipo: str
    monto: MontoStr
    fecha_negocio: date
    caja_id: uuid.UUID | None
    movimiento_id: uuid.UUID | None
    inversor: str | None
    nota: str | None
