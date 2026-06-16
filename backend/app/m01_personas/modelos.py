import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    CHAR,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Numeric,
    SmallInteger,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.modelos_base import Base, TimestampMixin, uuid_pk


class Persona(Base, TimestampMixin):
    __tablename__ = "persona"

    id: Mapped[uuid.UUID] = uuid_pk()
    # Identidad
    apellido: Mapped[str] = mapped_column(Text, nullable=False)
    nombre: Mapped[str] = mapped_column(Text, nullable=False)
    dni: Mapped[str] = mapped_column(Text, nullable=False)
    cuil: Mapped[str] = mapped_column(CHAR(11), nullable=False, unique=True)
    fecha_nac: Mapped[date] = mapped_column(Date, nullable=False)
    estado_civil: Mapped[str] = mapped_column(Text, nullable=False)
    email: Mapped[str] = mapped_column(Text, nullable=False)
    telefono: Mapped[str] = mapped_column(Text, nullable=False)
    # Domicilio
    domicilio_calle: Mapped[str] = mapped_column(Text, nullable=False)
    domicilio_numero: Mapped[str | None] = mapped_column(Text)
    domicilio_piso: Mapped[str | None] = mapped_column(Text)
    domicilio_localidad: Mapped[str] = mapped_column(Text, nullable=False)
    domicilio_provincia: Mapped[str] = mapped_column(
        Text, nullable=False, server_default="Buenos Aires"
    )
    # FK estructuradas a catálogos (nullable — retrocompatible con filas previas).
    provincia_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("provincia.id"), nullable=True
    )
    localidad_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("localidad.id"), nullable=True
    )
    observaciones_domicilio: Mapped[str | None] = mapped_column(Text)
    tipo_vivienda: Mapped[str] = mapped_column(Text, nullable=False)
    # Ingresos
    ingresos_declarados: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    ingresos_en_blanco: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, server_default="0"
    )
    ingresos_totales: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    # Laboral (opcional)
    empleador: Mapped[str | None] = mapped_column(Text)
    cuit_empleador: Mapped[str | None] = mapped_column(CHAR(11))
    fecha_ingreso_laboral: Mapped[date | None] = mapped_column(Date)
    # Relaciones (opcionales)
    referido_por_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("persona.id"))
    redes_sociales: Mapped[dict | None] = mapped_column(JSONB)
    # Control
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")

    referencias_rel: Mapped[list["PersonaReferencia"]] = relationship(
        cascade="all, delete-orphan", lazy="selectin"
    )

    __table_args__ = (
        CheckConstraint(
            "estado_civil IN ('soltero','casado','divorciado','viudo','union_convivencial')",
            name="persona_estado_civil_check",
        ),
        CheckConstraint(
            "tipo_vivienda IN ('propia','alquilada','familiar','prestada')",
            name="persona_tipo_vivienda_check",
        ),
    )


class PersonaReferencia(Base):
    __tablename__ = "persona_referencia"

    id: Mapped[uuid.UUID] = uuid_pk()
    persona_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("persona.id", ondelete="CASCADE"), nullable=False
    )
    nombre: Mapped[str] = mapped_column(Text, nullable=False)
    apellido: Mapped[str | None] = mapped_column(Text)
    telefono: Mapped[str] = mapped_column(Text, nullable=False)
    vinculo: Mapped[str] = mapped_column(Text, nullable=False)
    es_alternativo: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="true"
    )
    notas: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        CheckConstraint(
            "vinculo IN ('padre','madre','hermano','conyuge','pareja','hijo',"
            "'vecino','companero','amigo','otro')",
            name="persona_referencia_vinculo_check",
        ),
    )


class PersonaMarca(Base):
    __tablename__ = "persona_marca"

    id: Mapped[uuid.UUID] = uuid_pk()
    persona_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("persona.id", ondelete="CASCADE"), nullable=False
    )
    tipo: Mapped[str] = mapped_column(Text, nullable=False)
    motivo: Mapped[str | None] = mapped_column(Text)
    creada_por: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("usuario.id"))
    activa: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        CheckConstraint(
            "tipo IN ('operativa','lista_negra','vip','observado')",
            name="persona_marca_tipo_check",
        ),
    )


class PersonaDeudaBcra(Base):
    __tablename__ = "persona_deuda_bcra"

    id: Mapped[uuid.UUID] = uuid_pk()
    persona_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("persona.id"), nullable=False
    )
    entidad: Mapped[str] = mapped_column(Text, nullable=False)
    monto: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    situacion: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    fecha_informe: Mapped[date] = mapped_column(Date, nullable=False)
    fuente: Mapped[str] = mapped_column(Text, nullable=False, server_default="api_bcra")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        CheckConstraint(
            "situacion BETWEEN 1 AND 6", name="persona_deuda_bcra_situacion_check"
        ),
    )
