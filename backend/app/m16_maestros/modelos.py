import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.modelos_base import Base, TimestampMixin, uuid_pk


class Zona(Base, TimestampMixin):
    __tablename__ = "zona"

    id: Mapped[uuid.UUID] = uuid_pk()
    codigo: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    nombre: Mapped[str] = mapped_column(Text, nullable=False)
    orden: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")


class Sector(Base, TimestampMixin):
    __tablename__ = "sector"

    id: Mapped[uuid.UUID] = uuid_pk()
    codigo: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    nombre: Mapped[str] = mapped_column(Text, nullable=False)
    orden: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")


class Tema(Base, TimestampMixin):
    __tablename__ = "tema"

    id: Mapped[uuid.UUID] = uuid_pk()
    codigo: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    nombre: Mapped[str] = mapped_column(Text, nullable=False)
    orden: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")


class Canal(Base, TimestampMixin):
    __tablename__ = "canal"

    id: Mapped[uuid.UUID] = uuid_pk()
    codigo: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    nombre: Mapped[str] = mapped_column(Text, nullable=False)
    orden: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")


class Disposicion(Base, TimestampMixin):
    """Catálogo unificado de resultado de gestión — compartido entre interacciones CRM y paradas de ruta."""

    __tablename__ = "disposicion"

    id: Mapped[uuid.UUID] = uuid_pk()
    codigo: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    nombre: Mapped[str] = mapped_column(Text, nullable=False)
    genera_cobro: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    orden: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")


class Provincia(Base, TimestampMixin):
    __tablename__ = "provincia"

    id: Mapped[uuid.UUID] = uuid_pk()
    codigo: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    nombre: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    orden: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")


class Localidad(Base, TimestampMixin):
    __tablename__ = "localidad"

    id: Mapped[uuid.UUID] = uuid_pk()
    provincia_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("provincia.id"), nullable=False
    )
    codigo: Mapped[str | None] = mapped_column(Text)
    nombre: Mapped[str] = mapped_column(Text, nullable=False)
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")

    __table_args__ = (
        UniqueConstraint("provincia_id", "nombre", name="localidad_provincia_nombre_uq"),
    )


class AsignacionVendedor(Base):
    """Historial de asignación vendedor ↔ zona/sector. La vigente tiene vigente_hasta IS NULL."""

    __tablename__ = "asignacion_vendedor"

    id: Mapped[uuid.UUID] = uuid_pk()
    vendedor_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("usuario.id"), nullable=False
    )
    zona_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("zona.id"), nullable=False)
    sector_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sector.id"), nullable=False)
    vigente_desde: Mapped[date] = mapped_column(Date, nullable=False)
    vigente_hasta: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index(
            "asignacion_vendedor_vigente_uq",
            "vendedor_id",
            unique=True,
            postgresql_where="vigente_hasta IS NULL",
        ),
    )
