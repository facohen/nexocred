import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.modelos_base import Base, uuid_pk


def _created_at() -> Mapped[datetime]:
    return mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Interaccion(Base):
    __tablename__ = "interaccion"

    id: Mapped[uuid.UUID] = uuid_pk()
    persona_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("persona.id"))
    operador_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("usuario.id"))
    tipo: Mapped[str | None] = mapped_column(Text)
    tarea_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tarea.id"))
    detalle: Mapped[str | None] = mapped_column(Text)
    fecha: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_at: Mapped[datetime] = _created_at()

    __table_args__ = (
        CheckConstraint(
            "tipo IS NULL OR tipo IN ('llamada','visita','mensaje','nota')",
            name="interaccion_tipo_check",
        ),
    )


class AsignacionCrm(Base):
    __tablename__ = "asignacion_crm"

    id: Mapped[uuid.UUID] = uuid_pk()
    persona_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("persona.id"), nullable=False
    )
    operador_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("usuario.id"), nullable=False
    )
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    created_at: Mapped[datetime] = _created_at()


class Prospecto(Base):
    __tablename__ = "prospecto"

    id: Mapped[uuid.UUID] = uuid_pk()
    nombre: Mapped[str | None] = mapped_column(Text)
    telefono: Mapped[str | None] = mapped_column(Text)
    estado: Mapped[str] = mapped_column(Text, nullable=False, server_default="nuevo")
    persona_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("persona.id"))
    operador_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("usuario.id"))
    created_at: Mapped[datetime] = _created_at()

    __table_args__ = (
        CheckConstraint(
            "estado IN ('nuevo','contactado','calificado','convertido','descartado')",
            name="prospecto_estado_check",
        ),
    )
