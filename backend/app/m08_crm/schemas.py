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
    tema_id: uuid.UUID | None = None
    canal_id: uuid.UUID | None = None
    disposicion_id: uuid.UUID | None = None
    credito_id: uuid.UUID | None = None
    proximo_paso_fecha: date | None = None
    proximo_paso_nota: str | None = None


class InteraccionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    persona_id: uuid.UUID | None
    operador_id: uuid.UUID | None
    tipo: str | None
    tarea_id: uuid.UUID | None
    detalle: str | None
    fecha: datetime
    tema_id: uuid.UUID | None = None
    canal_id: uuid.UUID | None = None
    disposicion_id: uuid.UUID | None = None
    credito_id: uuid.UUID | None = None
    proximo_paso_fecha: date | None = None
    proximo_paso_nota: str | None = None


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


class PromesaIn(BaseModel):
    prestamo_id: uuid.UUID
    monto_prometido: str
    fecha_prometida: date
    canal_origen: str
    interaccion_id: uuid.UUID | None = None
    parada_ruta_id: uuid.UUID | None = None
    cuota_id: uuid.UUID | None = None


class PromesaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    prestamo_id: uuid.UUID
    cuota_id: uuid.UUID | None
    monto_prometido: str
    monto_exigible_base: str | None
    fecha_prometida: date
    estado: str
    canal_origen: str | None
    interaccion_id: uuid.UUID | None
    parada_ruta_id: uuid.UUID | None
    creada_por: uuid.UUID | None


class Ficha360Out(BaseModel):
    persona_id: str
    exposicion_total: str
    peor_bucket_dias: int
    prestamos_activos: int
    promesas_vigentes: int
