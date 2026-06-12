import uuid

from pydantic import BaseModel, ConfigDict

FAMILIAS = {"cobranza", "novacion", "crm"}
ACCIONES = {
    "crear_tarea", "crear_incidente", "enviar_notificacion_interna", "escalar_admin",
}


class ReglaIn(BaseModel):
    nombre: str
    familia: str
    disparador: str
    accion: str
    condicion_json: dict | None = None
    accion_params: dict | None = None
    activo: bool = True
    orden: int = 0


class ReglaPatch(BaseModel):
    nombre: str | None = None
    activo: bool | None = None
    orden: int | None = None
    accion_params: dict | None = None
    condicion_json: dict | None = None


class ReglaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nombre: str
    familia: str
    disparador: str
    accion: str
    condicion_json: dict | None
    accion_params: dict | None
    activo: bool
    orden: int


class ContextoIn(BaseModel):
    disparador: str
    prestamo_id: uuid.UUID | None = None
    persona_id: uuid.UUID | None = None
    familia: str | None = None
    datos: dict | None = None


class EfectoOut(BaseModel):
    regla_id: uuid.UUID
    accion: str
    resultado: str  # 'ok' | 'omitido' | 'error'
    detalle: str | None = None
    entidad_id: str | None = None


class ProcesarOut(BaseModel):
    disparados: int
    omitidos: int
    efectos: list[EfectoOut]


class EjecucionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    regla_id: uuid.UUID
    prestamo_id: uuid.UUID | None
    persona_id: uuid.UUID | None
    resultado: str
    detalle: str | None
    dedupe_key: str | None
