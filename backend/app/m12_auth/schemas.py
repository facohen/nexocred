import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

# Nota de diseno: usamos `str` en vez de `EmailStr` para email porque el validador
# de email rechaza TLDs reservados como `.test` (usados en fixtures y entornos de
# prueba). La unicidad y el formato basico se validan a nivel de dominio/DB.


class LoginIn(BaseModel):
    email: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshIn(BaseModel):
    refresh_token: str


class AccessOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UsuarioCreate(BaseModel):
    email: str
    nombre: str
    password: str = Field(min_length=6)
    roles: list[str] = Field(default_factory=list)


class UsuarioUpdate(BaseModel):
    nombre: str | None = None
    roles: list[str] | None = None


class UsuarioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    nombre: str
    activo: bool
    roles: list[str] = Field(default_factory=list)


class AuditoriaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    actor_id: uuid.UUID | None
    accion: str
    entidad: str
    entidad_id: str | None
    resultado: str
    created_at: datetime
    metadata_json: dict | None = None
