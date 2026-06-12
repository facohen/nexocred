import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

TIPOS = {"recibo", "cronograma", "mutuo", "pagare", "conformidad_novacion"}


class GenerarIn(BaseModel):
    tipo: str
    prestamo_id: uuid.UUID


class AnularIn(BaseModel):
    motivo: str


class DocumentoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    prestamo_id: uuid.UUID
    tipo: str
    numero: int
    hash_sha256: str
    url_storage: str | None
    emitido_por: uuid.UUID
    anulado_en: datetime | None
    anulado_por: uuid.UUID | None
