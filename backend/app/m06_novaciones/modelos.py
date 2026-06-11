import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.modelos_base import Base, uuid_pk


class Novacion(Base):
    __tablename__ = "novacion"

    id: Mapped[uuid.UUID] = uuid_pk()
    tipo: Mapped[str] = mapped_column(Text, nullable=False)
    estado: Mapped[str] = mapped_column(Text, nullable=False, server_default="borrador")
    nuevo_prestamo_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("prestamo.id"))
    creado_por: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("usuario.id"))
    idempotency_key: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        CheckConstraint(
            "tipo IN ('refinanciacion','consolidacion','transferencia','repactar_rapido')",
            name="novacion_tipo_check",
        ),
        CheckConstraint(
            "estado IN ('borrador','confirmada','anulada')",
            name="novacion_estado_check",
        ),
    )


class NovacionOrigen(Base):
    __tablename__ = "novacion_origen"

    id: Mapped[uuid.UUID] = uuid_pk()
    novacion_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("novacion.id"), nullable=False)
    prestamo_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("prestamo.id"), nullable=False)
