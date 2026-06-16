import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
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
    # E4: campos enriquecidos
    tema_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tema.id"))
    canal_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("canal.id"))
    disposicion_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("disposicion.id"))
    credito_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("prestamo.id"))
    proximo_paso_fecha: Mapped[date | None] = mapped_column(Date)
    proximo_paso_nota: Mapped[str | None] = mapped_column(Text)

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


class PromesaPago(Base):
    __tablename__ = "promesa_pago"

    id: Mapped[uuid.UUID] = uuid_pk()
    prestamo_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("prestamo.id"), nullable=False)
    cuota_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("cuota.id"))
    monto_prometido: Mapped[object] = mapped_column(Numeric(14, 2), nullable=False)
    monto_exigible_base: Mapped[object | None] = mapped_column(Numeric(14, 2))
    fecha_prometida: Mapped[object] = mapped_column(Date, nullable=False)
    estado: Mapped[str] = mapped_column(Text, nullable=False, server_default="vigente")
    canal_origen: Mapped[str | None] = mapped_column(Text)
    interaccion_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("interaccion.id"))
    parada_ruta_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("parada_ruta.id"))
    creada_por: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("usuario.id"))
    created_at: Mapped[datetime] = _created_at()

    __table_args__ = (
        CheckConstraint(
            "estado IN ('vigente','cumplida','parcial','rota')",
            name="promesa_pago_estado_check",
        ),
        CheckConstraint(
            "canal_origen IS NULL OR canal_origen IN ('call','campo')",
            name="promesa_pago_canal_origen_check",
        ),
        CheckConstraint(
            "num_nonnulls(interaccion_id, parada_ruta_id) = 1",
            name="promesa_pago_origen_xor_check",
        ),
    )
