import uuid
from datetime import date

from pydantic import BaseModel, field_validator


class CatalogoCreate(BaseModel):
    codigo: str
    nombre: str
    orden: int = 0


class CatalogoUpdate(BaseModel):
    nombre: str | None = None
    orden: int | None = None
    activo: bool | None = None


class CatalogoOut(BaseModel):
    id: uuid.UUID
    codigo: str
    nombre: str
    orden: int
    activo: bool

    model_config = {"from_attributes": True}


class DisposicionCreate(BaseModel):
    codigo: str
    nombre: str
    genera_cobro: bool = False
    orden: int = 0


class DisposicionUpdate(BaseModel):
    nombre: str | None = None
    genera_cobro: bool | None = None
    orden: int | None = None
    activo: bool | None = None


class DisposicionOut(BaseModel):
    id: uuid.UUID
    codigo: str
    nombre: str
    genera_cobro: bool
    orden: int
    activo: bool

    model_config = {"from_attributes": True}


class ProvinciaCreate(BaseModel):
    codigo: str
    nombre: str
    orden: int = 0


class ProvinciaUpdate(BaseModel):
    nombre: str | None = None
    orden: int | None = None
    activo: bool | None = None


class ProvinciaOut(BaseModel):
    id: uuid.UUID
    codigo: str
    nombre: str
    orden: int
    activo: bool

    model_config = {"from_attributes": True}


class LocalidadCreate(BaseModel):
    provincia_id: uuid.UUID
    codigo: str | None = None
    nombre: str

    @field_validator("nombre")
    @classmethod
    def normalizar_nombre(cls, v: str) -> str:
        return v.strip()


class LocalidadUpdate(BaseModel):
    nombre: str | None = None
    activo: bool | None = None


class LocalidadOut(BaseModel):
    id: uuid.UUID
    provincia_id: uuid.UUID
    codigo: str | None
    nombre: str
    activo: bool

    model_config = {"from_attributes": True}


class AsignacionVendedorIn(BaseModel):
    zona_id: uuid.UUID
    sector_id: uuid.UUID
    vigente_desde: date


class AsignacionVendedorOut(BaseModel):
    id: uuid.UUID
    vendedor_id: uuid.UUID
    zona_id: uuid.UUID
    sector_id: uuid.UUID
    vigente_desde: date
    vigente_hasta: date | None

    model_config = {"from_attributes": True}


class VendedorConAsignacionOut(BaseModel):
    id: uuid.UUID
    nombre: str
    email: str
    asignacion_vigente: AsignacionVendedorOut | None

    model_config = {"from_attributes": True}
