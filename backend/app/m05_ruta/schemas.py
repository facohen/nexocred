import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

from app.tipos import MontoStr


class GenerarRutaIn(BaseModel):
    cobrador_id: uuid.UUID
    fecha: date


class RutaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    cobrador_id: uuid.UUID | None
    fecha: date | None
    estado: str


class ParadaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    ruta_id: uuid.UUID
    prestamo_id: uuid.UUID
    orden: int
    resultado: str | None
    monto_cobrado: MontoStr | None
    foto_url: str | None
    lat: str | None
    lng: str | None
    notas: str | None
    visitada_en: datetime | None


class ParadaConSaldoOut(ParadaOut):
    saldo_exigible: MontoStr


class RutaDetalleOut(RutaOut):
    paradas: list[ParadaOut]


class VisitarIn(BaseModel):
    resultado: str
    monto_cobrado: MontoStr | None = None
    foto_url: str | None = None
    lat: str | None = None
    lng: str | None = None
    notas: str | None = None
    caja_id: uuid.UUID | None = None
    fecha_negocio: date | None = None


class VisitarOut(BaseModel):
    parada_id: uuid.UUID
    resultado: str
    pago_id: uuid.UUID | None = None


# ---------- Sync offline ----------
class ParadaSyncIn(BaseModel):
    id: uuid.UUID
    prestamo_id: uuid.UUID
    orden: int
    resultado: str | None = None
    monto_cobrado: MontoStr | None = None
    foto_url: str | None = None
    lat: str | None = None
    lng: str | None = None
    notas: str | None = None
    visitada_en: datetime | None = None
    pago_id: uuid.UUID | None = None


class SyncIn(BaseModel):
    paradas: list[ParadaSyncIn]
    caja_id: uuid.UUID | None = None


class SyncItemOut(BaseModel):
    parada_id: uuid.UUID
    estado: str  # 'aplicada' | 'omitida' | 'rechazada'
    pago_id: uuid.UUID | None = None


class SyncOut(BaseModel):
    ruta_id: uuid.UUID
    items: list[SyncItemOut]
    aplicadas: int
    omitidas: int
    rechazadas: int = 0


# ---------- Rendicion ----------
class GenerarRendicionIn(BaseModel):
    ruta_id: uuid.UUID
    fecha_negocio: date | None = None


class DescargoIn(BaseModel):
    concepto: str
    monto: MontoStr


class DescargoEstadoIn(BaseModel):
    estado: str  # 'aprobado' | 'rechazado'


class RendicionEstadoIn(BaseModel):
    estado: str  # 'presentada' | 'aprobada' | 'observada'


class DescargoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    rendicion_id: uuid.UUID
    concepto: str
    monto: MontoStr
    estado: str
    aprobado_por: uuid.UUID | None


class RendicionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    ruta_id: uuid.UUID
    cobrador_id: uuid.UUID | None
    fecha_negocio: date
    total_cobrado: MontoStr
    total_descargos: MontoStr
    diferencia: MontoStr
    estado: str


class RendicionDetalleOut(RendicionOut):
    descargos: list[DescargoOut]
