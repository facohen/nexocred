import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class TareaIn(BaseModel):
    persona_id: uuid.UUID | None = None
    operador_id: uuid.UUID | None = None
    titulo: str
    descripcion: str | None = None
    prioridad: str | None = None
    vencimiento: date | None = None


class TareaPatch(BaseModel):
    estado: str | None = None
    operador_id: uuid.UUID | None = None
    prioridad: str | None = None
    vencimiento: date | None = None


class TareaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    persona_id: uuid.UUID | None
    operador_id: uuid.UUID | None
    titulo: str | None
    descripcion: str | None
    estado: str
    origen: str | None
    alerta_id: uuid.UUID | None
    prioridad: str | None
    vencimiento: date | None


class CompletarTareaIn(BaseModel):
    tipo: str = "nota"
    detalle: str | None = None


class InteraccionIn(BaseModel):
    persona_id: uuid.UUID
    tipo: str
    detalle: str | None = None
    tarea_id: uuid.UUID | None = None


class InteraccionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    persona_id: uuid.UUID | None
    operador_id: uuid.UUID | None
    tipo: str | None
    tarea_id: uuid.UUID | None
    detalle: str | None
    fecha: datetime


class IncidenteIn(BaseModel):
    persona_id: uuid.UUID | None = None
    tipo: str | None = None
    titulo: str | None = None
    severidad: str | None = None
    detalle: str | None = None
    operador_id: uuid.UUID | None = None


class IncidentePatch(BaseModel):
    estado: str | None = None
    severidad: str | None = None
    operador_id: uuid.UUID | None = None


class IncidenteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    persona_id: uuid.UUID | None
    tipo: str | None
    estado: str
    titulo: str | None
    severidad: str | None
    operador_id: uuid.UUID | None
    detalle: str | None


class AsignacionIn(BaseModel):
    persona_id: uuid.UUID
    operador_id: uuid.UUID


class AsignacionMasivaIn(BaseModel):
    persona_ids: list[uuid.UUID]
    operador_id: uuid.UUID


class AsignacionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    persona_id: uuid.UUID
    operador_id: uuid.UUID
    activo: bool


class TimelineEvento(BaseModel):
    tipo: str
    fecha: datetime
    detalle: str | None = None
    referencia: str | None = None


class ProspectoIn(BaseModel):
    nombre: str | None = None
    telefono: str | None = None
    operador_id: uuid.UUID | None = None


class ProspectoPatch(BaseModel):
    estado: str | None = None
    nombre: str | None = None
    telefono: str | None = None
    persona_id: uuid.UUID | None = None


class ProspectoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    nombre: str | None
    telefono: str | None
    estado: str
    persona_id: uuid.UUID | None
    operador_id: uuid.UUID | None
