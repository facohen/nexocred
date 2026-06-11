import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Table,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.modelos_base import Base, TimestampMixin, uuid_pk

usuario_rol = Table(
    "usuario_rol",
    Base.metadata,
    Column("usuario_id", ForeignKey("usuario.id", ondelete="CASCADE"), primary_key=True),
    Column("rol_id", ForeignKey("rol.id", ondelete="CASCADE"), primary_key=True),
)


class Rol(Base):
    __tablename__ = "rol"

    id: Mapped[uuid.UUID] = uuid_pk()
    nombre: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    descripcion: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Usuario(Base, TimestampMixin):
    __tablename__ = "usuario"

    id: Mapped[uuid.UUID] = uuid_pk()
    email: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    nombre: Mapped[str] = mapped_column(Text, nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")

    roles: Mapped[list[Rol]] = relationship(
        secondary=usuario_rol, lazy="selectin"
    )
