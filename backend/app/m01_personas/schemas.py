import uuid
from datetime import date

from pydantic import BaseModel, ConfigDict, Field

from app.tipos import MontoStr


class ReferenciaIn(BaseModel):
    nombre: str
    apellido: str | None = None
    telefono: str
    vinculo: str
    es_alternativo: bool = True
    notas: str | None = None


class ReferenciaOut(ReferenciaIn):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    persona_id: uuid.UUID


class MarcaIn(BaseModel):
    tipo: str
    motivo: str | None = None


class MarcaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    persona_id: uuid.UUID
    tipo: str
    motivo: str | None = None
    activa: bool


class PersonaCreate(BaseModel):
    apellido: str
    nombre: str
    dni: str
    cuil: str
    fecha_nac: date
    estado_civil: str
    email: str
    telefono: str
    domicilio_calle: str
    domicilio_numero: str | None = None
    domicilio_piso: str | None = None
    domicilio_localidad: str
    domicilio_provincia: str = "Buenos Aires"
    observaciones_domicilio: str | None = None
    tipo_vivienda: str
    ingresos_declarados: MontoStr
    ingresos_en_blanco: MontoStr = Field(default="0")  # type: ignore[assignment]
    ingresos_totales: MontoStr
    empleador: str | None = None
    cuit_empleador: str | None = None
    fecha_ingreso_laboral: date | None = None
    referido_por_id: uuid.UUID | None = None
    redes_sociales: dict | None = None
    provincia_id: uuid.UUID | None = None
    localidad_id: uuid.UUID | None = None
    referencias: list[ReferenciaIn] = Field(min_length=1)


class PersonaUpdate(BaseModel):
    # DNI y CUIL no son modificables (spec §3): se ignoran si vienen.
    nombre: str | None = None
    apellido: str | None = None
    estado_civil: str | None = None
    email: str | None = None
    telefono: str | None = None
    domicilio_calle: str | None = None
    domicilio_numero: str | None = None
    domicilio_piso: str | None = None
    domicilio_localidad: str | None = None
    domicilio_provincia: str | None = None
    observaciones_domicilio: str | None = None
    tipo_vivienda: str | None = None
    ingresos_declarados: MontoStr | None = None
    ingresos_en_blanco: MontoStr | None = None
    ingresos_totales: MontoStr | None = None
    empleador: str | None = None
    cuit_empleador: str | None = None
    fecha_ingreso_laboral: date | None = None
    activo: bool | None = None
    provincia_id: uuid.UUID | None = None
    localidad_id: uuid.UUID | None = None


class PersonaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    apellido: str
    nombre: str
    dni: str
    cuil: str
    fecha_nac: date
    estado_civil: str
    email: str
    telefono: str
    domicilio_calle: str
    domicilio_numero: str | None
    domicilio_piso: str | None
    domicilio_localidad: str
    domicilio_provincia: str
    observaciones_domicilio: str | None
    tipo_vivienda: str
    ingresos_declarados: MontoStr
    ingresos_en_blanco: MontoStr
    ingresos_totales: MontoStr
    empleador: str | None
    cuit_empleador: str | None
    fecha_ingreso_laboral: date | None
    referido_por_id: uuid.UUID | None
    activo: bool
    provincia_id: uuid.UUID | None = None
    localidad_id: uuid.UUID | None = None
    provincia_nombre: str | None = None
    localidad_nombre: str | None = None
    referencias: list[ReferenciaOut] = Field(default_factory=list)


class PersonaListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    apellido: str
    nombre: str
    dni: str
    cuil: str
    activo: bool


class PersonaPagina(BaseModel):
    data: list[PersonaListItem]
    total: int
    page: int
    per_page: int


class DeudaBcraOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    persona_id: uuid.UUID
    entidad: str
    monto: MontoStr
    situacion: int
    fecha_informe: date
    fuente: str
