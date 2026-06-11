import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.modelos_base import Base, TimestampMixin, uuid_pk


class ProductoCredito(Base, TimestampMixin):
    __tablename__ = "producto_credito"

    id: Mapped[uuid.UUID] = uuid_pk()
    nombre: Mapped[str] = mapped_column(Text, nullable=False)
    descripcion: Mapped[str | None] = mapped_column(Text)
    estado: Mapped[str] = mapped_column(Text, nullable=False, server_default="borrador")
    version_vigente: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")

    __table_args__ = (
        CheckConstraint(
            "estado IN ('borrador','activo','discontinuado')",
            name="producto_credito_estado_check",
        ),
    )


class ProductoVersion(Base):
    __tablename__ = "producto_version"

    id: Mapped[uuid.UUID] = uuid_pk()
    producto_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("producto_credito.id"), nullable=False
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    periodicidad: Mapped[str] = mapped_column(Text, nullable=False, server_default="mensual")
    plazos_permitidos: Mapped[str | None] = mapped_column(Text)  # CSV de cuotas permitidas
    monto_minimo: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    monto_maximo: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    snapshot_json: Mapped[str | None] = mapped_column(Text)
    creada_por: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("usuario.id"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("producto_id", "version", name="producto_version_uq"),
    )


class GastoOriginacion(Base):
    __tablename__ = "gasto_originacion"

    id: Mapped[uuid.UUID] = uuid_pk()
    producto_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("producto_credito.id"), nullable=False
    )
    nombre: Mapped[str] = mapped_column(Text, nullable=False)
    tipo: Mapped[str] = mapped_column(Text, nullable=False)
    valor: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False)
    financiado: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    jurisdiccion: Mapped[str | None] = mapped_column(Text)
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        CheckConstraint("tipo IN ('porcentaje','fijo')", name="gasto_originacion_tipo_check"),
    )


class PerfilPricing(Base):
    __tablename__ = "perfil_pricing"

    id: Mapped[uuid.UUID] = uuid_pk()
    nombre: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    descripcion: Mapped[str | None] = mapped_column(Text)
    orden: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class MatrizTasa(Base):
    __tablename__ = "matriz_tasa"

    id: Mapped[uuid.UUID] = uuid_pk()
    producto_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("producto_credito.id"), nullable=False
    )
    perfil_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("perfil_pricing.id"), nullable=False
    )
    plazo: Mapped[int] = mapped_column(Integer, nullable=False)
    tasa: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False)
    vigente_desde: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint(
            "producto_id", "perfil_id", "plazo", name="matriz_tasa_uq"
        ),
    )


class MatrizComision(Base):
    __tablename__ = "matriz_comision"

    id: Mapped[uuid.UUID] = uuid_pk()
    producto_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("producto_credito.id"), nullable=False
    )
    perfil_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("perfil_pricing.id"), nullable=False
    )
    comision: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False)
    vigente_desde: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint(
            "producto_id", "perfil_id", name="matriz_comision_uq"
        ),
    )
