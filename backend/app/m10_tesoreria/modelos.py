"""Modelos F1d de tesoreria/documentos: aporte_retiro y documento_numero."""

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
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


class AporteRetiro(Base):
    __tablename__ = "aporte_retiro"

    id: Mapped[uuid.UUID] = uuid_pk()
    tipo: Mapped[str] = mapped_column(Text, nullable=False)
    monto: Mapped[Decimal] = mapped_column(Numeric(16, 2), nullable=False)
    fecha_negocio: Mapped[date] = mapped_column(Date, nullable=False)
    caja_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("caja.id"))
    movimiento_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("movimiento_caja.id")
    )
    inversor: Mapped[str | None] = mapped_column(Text)
    nota: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        CheckConstraint(
            "tipo IN ('aporte','retiro')", name="aporte_retiro_tipo_check"
        ),
    )


class DocumentoNumero(Base):
    __tablename__ = "documento_numero"

    tipo: Mapped[str] = mapped_column(Text, primary_key=True)
    ultimo: Mapped[int] = mapped_column(BigInteger, nullable=False, server_default="0")
