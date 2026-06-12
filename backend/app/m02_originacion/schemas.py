import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.m15_catalogo.schemas import SimuladorOut  # noqa: F401  (reexport conveniente)
from app.tipos import MontoStr, TasaStr


class SolicitudCreate(BaseModel):
    persona_id: uuid.UUID
    producto_id: uuid.UUID
    monto: MontoStr
    cantidad_cuotas: int = Field(gt=0)
    vendedor_id: uuid.UUID | None = None


class CambioEstadoIn(BaseModel):
    estado: str
    motivo_rechazo: str | None = None


class SolicitudOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    persona_id: uuid.UUID
    producto_id: uuid.UUID
    monto: MontoStr | None = None
    cantidad_cuotas: int | None = None
    estado: str
    vendedor_id: uuid.UUID | None = None
    perfil_pricing_id: uuid.UUID | None = None
    tasa_resuelta: TasaStr | None = None
    score: int | None = None
    motivo_rechazo: str | None = None


class ChecklistOut(BaseModel):
    edad: bool
    cuota_ingreso: bool
    bcra: bool
    mora_previa: bool


class SimularIn(BaseModel):
    fecha_primera_cuota: date


class DesembolsarIn(BaseModel):
    caja_id: uuid.UUID
    fecha_negocio: date | None = None
    fecha_primera_cuota: date | None = None
    tasa_punitorio_diario: TasaStr = Field(default=Decimal("0"))


class DesembolsoOut(BaseModel):
    prestamo_id: uuid.UUID
    solicitud_id: uuid.UUID
    estado: str
    capital: MontoStr
    cantidad_cuotas: int
    movimiento_caja_id: uuid.UUID
