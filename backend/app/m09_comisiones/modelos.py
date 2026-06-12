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


class ComisionLiquidacion(Base):
    __tablename__ = "comision_liquidacion"

    id: Mapped[uuid.UUID] = uuid_pk()
    vendedor_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("usuario.id"), nullable=False
    )
    periodo_desde: Mapped[date] = mapped_column(Date, nullable=False)
    periodo_hasta: Mapped[date] = mapped_column(Date, nullable=False)
    monto_total: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, server_default="0"
    )
    estado: Mapped[str] = mapped_column(Text, nullable=False, server_default="borrador")
    aprobada_por: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("usuario.id"))
    aprobada_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    egreso_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("movimiento_caja.id")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        CheckConstraint(
            "estado IN ('borrador','aprobada','pagada')",
            name="comision_liquidacion_estado_check",
        ),
    )


class ComisionLiquidacionDetalle(Base):
    __tablename__ = "comision_liquidacion_detalle"

    id: Mapped[uuid.UUID] = uuid_pk()
    liquidacion_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("comision_liquidacion.id"), nullable=False
    )
    comision_devengo_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("comision_devengo.id"), nullable=False
    )
    monto: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
