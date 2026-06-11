import uuid
from datetime import date

from pydantic import BaseModel, ConfigDict, Field

from app.tipos import MontoStr, TasaStr


class GastoIn(BaseModel):
    nombre: str
    tipo: str
    valor: TasaStr
    financiado: bool = False
    jurisdiccion: str | None = None


class GastoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    producto_id: uuid.UUID
    nombre: str
    tipo: str
    valor: TasaStr
    financiado: bool
    jurisdiccion: str | None
    activo: bool


class ProductoCreate(BaseModel):
    nombre: str
    descripcion: str | None = None
    periodicidad: str = "mensual"
    plazos_permitidos: list[int] = Field(default_factory=list)
    monto_minimo: MontoStr | None = None
    monto_maximo: MontoStr | None = None
    gastos: list[GastoIn] = Field(default_factory=list)


class ProductoUpdate(BaseModel):
    nombre: str | None = None
    descripcion: str | None = None
    periodicidad: str | None = None
    plazos_permitidos: list[int] | None = None
    monto_minimo: MontoStr | None = None
    monto_maximo: MontoStr | None = None


class ProductoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    nombre: str
    descripcion: str | None
    estado: str
    version_vigente: int
    activo: bool
    periodicidad: str | None = None
    plazos_permitidos: list[int] = Field(default_factory=list)
    monto_minimo: MontoStr | None = None
    monto_maximo: MontoStr | None = None
    gastos: list[GastoOut] = Field(default_factory=list)


# ---------- perfiles ----------
class PerfilCreate(BaseModel):
    nombre: str
    descripcion: str | None = None
    orden: int = 0


class PerfilOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    nombre: str
    descripcion: str | None
    orden: int
    activo: bool


# ---------- matrices ----------
class CeldaTasaIn(BaseModel):
    producto_id: uuid.UUID
    perfil_id: uuid.UUID
    plazo: int
    tasa: TasaStr


class MatrizTasaIn(BaseModel):
    celdas: list[CeldaTasaIn] = Field(min_length=1)


class CeldaTasaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    producto_id: uuid.UUID
    perfil_id: uuid.UUID
    plazo: int
    tasa: TasaStr


class CeldaComisionIn(BaseModel):
    producto_id: uuid.UUID
    perfil_id: uuid.UUID
    comision: TasaStr


class MatrizComisionIn(BaseModel):
    celdas: list[CeldaComisionIn] = Field(min_length=1)


class CeldaComisionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    producto_id: uuid.UUID
    perfil_id: uuid.UUID
    comision: TasaStr


# ---------- repricing ----------
class AjusteTasaIn(BaseModel):
    producto_id: uuid.UUID
    perfil_id: uuid.UUID
    plazo: int
    tasa: TasaStr


class RepricingIn(BaseModel):
    ajustes: list[AjusteTasaIn] = Field(min_length=1)


class CambioTasaOut(BaseModel):
    producto_id: uuid.UUID
    perfil_id: uuid.UUID
    plazo: int
    tasa_anterior: TasaStr | None = None
    tasa_nueva: TasaStr


class RepricingPreviewOut(BaseModel):
    cambios: list[CambioTasaOut]


class RepricingResultadoOut(BaseModel):
    cambios: list[CambioTasaOut]
    productos_versionados: list[uuid.UUID]


# ---------- simuladores ----------
class SimuladorLibreIn(BaseModel):
    capital: MontoStr
    tasa_interes_directo: TasaStr
    cantidad_cuotas: int = Field(gt=0)
    periodicidad: str = "mensual"
    fecha_primera_cuota: date


class SimuladorInternoIn(BaseModel):
    capital: MontoStr
    producto_id: uuid.UUID
    perfil_id: uuid.UUID
    cantidad_cuotas: int = Field(gt=0)
    periodicidad: str = "mensual"
    fecha_primera_cuota: date


class FilaCronogramaOut(BaseModel):
    numero: int
    vencimiento: date
    capital: MontoStr
    interes: MontoStr
    cuota: MontoStr


class SimuladorOut(BaseModel):
    capital: MontoStr
    tasa_interes_directo: TasaStr
    cantidad_cuotas: int
    periodicidad: str
    total_capital: MontoStr
    total_interes: MontoStr
    total_a_pagar: MontoStr
    cuotas: list[FilaCronogramaOut]
