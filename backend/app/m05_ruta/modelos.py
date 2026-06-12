import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Numeric,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.modelos_base import Base, uuid_pk


def _created_at() -> Mapped[datetime]:
    return mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Rendicion(Base):
    __tablename__ = "rendicion"

    id: Mapped[uuid.UUID] = uuid_pk()
    ruta_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("ruta_diaria.id"), nullable=False
    )
    cobrador_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("usuario.id"))
    fecha_negocio: Mapped[date] = mapped_column(Date, nullable=False)
    total_cobrado: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, server_default="0"
    )
    total_descargos: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, server_default="0"
    )
    diferencia: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, server_default="0"
    )
    estado: Mapped[str] = mapped_column(Text, nullable=False, server_default="abierta")
    created_at: Mapped[datetime] = _created_at()

    __table_args__ = (
        CheckConstraint(
            "estado IN ('abierta','presentada','aprobada','observada')",
            name="rendicion_estado_check",
        ),
    )


class RendicionDescargo(Base):
    __tablename__ = "rendicion_descargo"

    id: Mapped[uuid.UUID] = uuid_pk()
    rendicion_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("rendicion.id"), nullable=False
    )
    concepto: Mapped[str] = mapped_column(Text, nullable=False)
    monto: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    estado: Mapped[str] = mapped_column(Text, nullable=False, server_default="pendiente")
    aprobado_por: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("usuario.id"))
    created_at: Mapped[datetime] = _created_at()

    __table_args__ = (
        CheckConstraint(
            "estado IN ('pendiente','aprobado','rechazado')",
            name="rendicion_descargo_estado_check",
        ),
    )
