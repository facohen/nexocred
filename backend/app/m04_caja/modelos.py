import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Numeric,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.modelos_base import Base, uuid_pk


class Caja(Base):
    __tablename__ = "caja"

    id: Mapped[uuid.UUID] = uuid_pk()
    nombre: Mapped[str] = mapped_column(Text, nullable=False)
    tipo: Mapped[str | None] = mapped_column(Text)
    saldo_teorico: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, server_default="0"
    )
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class ArqueoCaja(Base):
    __tablename__ = "arqueo_caja"

    id: Mapped[uuid.UUID] = uuid_pk()
    caja_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("caja.id"), nullable=False)
    fecha_negocio: Mapped[date] = mapped_column(Date, nullable=False)
    saldo_teorico: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    saldo_fisico: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    diferencia: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    cerrado_por: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("usuario.id"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("caja_id", "fecha_negocio", name="arqueo_caja_caja_fecha_uq"),
    )
