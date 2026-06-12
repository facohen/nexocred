"""Tablas stub minimas para que las FK de etapas posteriores resuelvan.

Estas tablas pertenecen a modulos fuera de F1a (M02/M03/M04/M05/M06/M07/M08/M09/M11/M13).
Aca se crean con columnas minimas: UUID pk, las FK que la spec declara explicitamente,
los campos necesarios para indices (BRIN sobre created_at en tablas de ledger) y
los CHECK/UNIQUE que la spec exige. Cada etapa posterior extiende via nuevas migraciones.
"""

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.modelos_base import Base, uuid_pk


def _created_at() -> Mapped[datetime]:
    return mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class SolicitudCredito(Base):
    __tablename__ = "solicitud_credito"
    id: Mapped[uuid.UUID] = uuid_pk()
    persona_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("persona.id"), nullable=False)
    producto_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("producto_credito.id"), nullable=False
    )
    monto: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    estado: Mapped[str] = mapped_column(Text, nullable=False, server_default="borrador")
    vendedor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("usuario.id"))
    perfil_pricing_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("perfil_pricing.id")
    )
    tasa_resuelta: Mapped[Decimal | None] = mapped_column(Numeric(10, 4))
    score: Mapped[int | None] = mapped_column(Integer)
    motivo_rechazo: Mapped[str | None] = mapped_column(Text)
    cantidad_cuotas: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = _created_at()


class Prestamo(Base):
    __tablename__ = "prestamo"
    id: Mapped[uuid.UUID] = uuid_pk()
    persona_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("persona.id"), nullable=False)
    producto_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("producto_credito.id"), nullable=False
    )
    solicitud_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("solicitud_credito.id")
    )
    capital: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    estado: Mapped[str] = mapped_column(Text, nullable=False, server_default="vigente")
    snapshot_terminos: Mapped[dict | None] = mapped_column(JSONB)
    fecha_desembolso: Mapped[date | None] = mapped_column(Date)
    tasa_punitorio_diario: Mapped[Decimal] = mapped_column(
        Numeric(10, 4), nullable=False, server_default="0"
    )
    vendedor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("usuario.id"))
    monto_desembolsado: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    created_at: Mapped[datetime] = _created_at()


class Cuota(Base):
    __tablename__ = "cuota"
    id: Mapped[uuid.UUID] = uuid_pk()
    prestamo_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("prestamo.id"), nullable=False)
    numero: Mapped[int] = mapped_column(Integer, nullable=False)
    vencimiento: Mapped[date | None] = mapped_column(Date)
    capital: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    interes: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    cuota: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    punitorio_acumulado: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, server_default="0"
    )
    estado: Mapped[str] = mapped_column(Text, nullable=False, server_default="pendiente")
    created_at: Mapped[datetime] = _created_at()


class RutaDiaria(Base):
    __tablename__ = "ruta_diaria"
    id: Mapped[uuid.UUID] = uuid_pk()
    cobrador_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("usuario.id"))
    fecha: Mapped[date | None] = mapped_column(Date)
    estado: Mapped[str] = mapped_column(Text, nullable=False, server_default="abierta")
    created_at: Mapped[datetime] = _created_at()


class ParadaRuta(Base):
    __tablename__ = "parada_ruta"
    id: Mapped[uuid.UUID] = uuid_pk()
    ruta_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("ruta_diaria.id"), nullable=False)
    prestamo_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("prestamo.id"), nullable=False)
    orden: Mapped[int] = mapped_column(Integer, nullable=False)
    resultado: Mapped[str | None] = mapped_column(Text)
    monto_cobrado: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    foto_url: Mapped[str | None] = mapped_column(Text)
    lat: Mapped[Decimal | None] = mapped_column(Numeric(10, 7))
    lng: Mapped[Decimal | None] = mapped_column(Numeric(10, 7))
    notas: Mapped[str | None] = mapped_column(Text)
    visitada_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = _created_at()

    __table_args__ = (
        CheckConstraint(
            "resultado IS NULL OR resultado IN "
            "('pago','parcial','promesa','ausente','se_niega','cancelado')",
            name="parada_ruta_resultado_check",
        ),
    )


class MovimientoCaja(Base):
    __tablename__ = "movimiento_caja"
    id: Mapped[uuid.UUID] = uuid_pk()
    caja_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("caja.id"))
    tipo: Mapped[str | None] = mapped_column(Text)
    monto: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    fecha_negocio: Mapped[date | None] = mapped_column(Date)
    concepto: Mapped[str | None] = mapped_column(Text)
    categoria: Mapped[str | None] = mapped_column(Text)
    contraparte_caja_id: Mapped[uuid.UUID | None] = mapped_column()
    pago_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("pago.id"))
    referencia: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = _created_at()


class Pago(Base):
    __tablename__ = "pago"
    id: Mapped[uuid.UUID] = uuid_pk()
    prestamo_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("prestamo.id"), nullable=False)
    parada_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("parada_ruta.id"))
    caja_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("movimiento_caja.id"))
    monto: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    excedente: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, server_default="0"
    )
    estado: Mapped[str] = mapped_column(Text, nullable=False, server_default="registrado")
    fecha_negocio: Mapped[date | None] = mapped_column(Date)
    idempotency_key: Mapped[str | None] = mapped_column(Text)
    canal: Mapped[str | None] = mapped_column(Text)
    corrige_pago_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("pago.id"))
    created_at: Mapped[datetime] = _created_at()


class Imputacion(Base):
    __tablename__ = "imputacion"
    id: Mapped[uuid.UUID] = uuid_pk()
    pago_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("pago.id"), nullable=False)
    cuota_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("cuota.id"))
    concepto: Mapped[str | None] = mapped_column(Text)
    monto: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    orden_waterfall: Mapped[int | None] = mapped_column(Integer)
    cuota_numero: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = _created_at()


class ComisionDevengo(Base):
    __tablename__ = "comision_devengo"
    id: Mapped[uuid.UUID] = uuid_pk()
    prestamo_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("prestamo.id"), nullable=False)
    vendedor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("usuario.id"))
    monto: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    estado: Mapped[str] = mapped_column(Text, nullable=False, server_default="devengada")
    tipo: Mapped[str | None] = mapped_column(Text)
    porcentaje: Mapped[Decimal | None] = mapped_column(Numeric(10, 4))
    clawback_de_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("comision_devengo.id")
    )
    created_at: Mapped[datetime] = _created_at()


class SnapshotCartera(Base):
    __tablename__ = "snapshot_cartera"
    id: Mapped[uuid.UUID] = uuid_pk()
    fecha_corte: Mapped[date | None] = mapped_column(Date)
    prestamos_vigentes: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
    prestamos_en_mora: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
    colocacion_mes: Mapped[Decimal] = mapped_column(
        Numeric(16, 2), nullable=False, server_default="0"
    )
    intereses_cobrados_mes: Mapped[Decimal] = mapped_column(
        Numeric(16, 2), nullable=False, server_default="0"
    )
    punitorios_cobrados_mes: Mapped[Decimal] = mapped_column(
        Numeric(16, 2), nullable=False, server_default="0"
    )
    capital_disponible: Mapped[Decimal] = mapped_column(
        Numeric(16, 2), nullable=False, server_default="0"
    )
    created_at: Mapped[datetime] = _created_at()


class Tarea(Base):
    __tablename__ = "tarea"
    id: Mapped[uuid.UUID] = uuid_pk()
    persona_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("persona.id"))
    operador_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("usuario.id"))
    titulo: Mapped[str | None] = mapped_column(Text)
    estado: Mapped[str] = mapped_column(Text, nullable=False, server_default="pendiente")
    origen: Mapped[str | None] = mapped_column(Text, server_default="manual")
    alerta_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("alerta.id"))
    vencimiento: Mapped[date | None] = mapped_column(Date)
    prioridad: Mapped[str | None] = mapped_column(Text)
    descripcion: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = _created_at()


class Incidente(Base):
    __tablename__ = "incidente"
    id: Mapped[uuid.UUID] = uuid_pk()
    persona_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("persona.id"))
    tipo: Mapped[str | None] = mapped_column(Text)
    estado: Mapped[str] = mapped_column(Text, nullable=False, server_default="abierto")
    titulo: Mapped[str | None] = mapped_column(Text)
    severidad: Mapped[str | None] = mapped_column(Text)
    operador_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("usuario.id"))
    detalle: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = _created_at()


class Alerta(Base):
    __tablename__ = "alerta"
    id: Mapped[uuid.UUID] = uuid_pk()
    prestamo_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("prestamo.id"))
    persona_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("persona.id"))
    tipo: Mapped[str | None] = mapped_column(Text)
    estado: Mapped[str] = mapped_column(Text, nullable=False, server_default="activa")
    severidad: Mapped[str | None] = mapped_column(Text)
    metrica: Mapped[str | None] = mapped_column(Text)
    operador_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("usuario.id"))
    tarea_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tarea.id"))
    valor: Mapped[Decimal | None] = mapped_column(Numeric(14, 4))
    resuelta_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    justificacion: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = _created_at()


class WorkflowRegla(Base):
    __tablename__ = "workflow_regla"
    id: Mapped[uuid.UUID] = uuid_pk()
    nombre: Mapped[str] = mapped_column(Text, nullable=False)
    familia: Mapped[str] = mapped_column(Text, nullable=False)
    disparador: Mapped[str] = mapped_column(Text, nullable=False)
    condicion_json: Mapped[dict | None] = mapped_column(JSONB)
    accion: Mapped[str] = mapped_column(Text, nullable=False)
    accion_params: Mapped[dict | None] = mapped_column(JSONB)
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    orden: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    created_at: Mapped[datetime] = _created_at()

    __table_args__ = (
        CheckConstraint(
            "familia IN ('cobranza','novacion','crm')", name="workflow_regla_familia_check"
        ),
    )


class WorkflowEjecucion(Base):
    __tablename__ = "workflow_ejecucion"
    id: Mapped[uuid.UUID] = uuid_pk()
    regla_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workflow_regla.id"), nullable=False)
    prestamo_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("prestamo.id"))
    persona_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("persona.id"))
    resultado: Mapped[str] = mapped_column(Text, nullable=False)
    detalle: Mapped[str | None] = mapped_column(Text)
    ejecutado_en: Mapped[datetime] = _created_at()

    __table_args__ = (
        CheckConstraint(
            "resultado IN ('ok','error','omitido')", name="workflow_ejecucion_resultado_check"
        ),
    )


class DocumentoEmitido(Base):
    __tablename__ = "documento_emitido"
    id: Mapped[uuid.UUID] = uuid_pk()
    prestamo_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("prestamo.id"), nullable=False)
    tipo: Mapped[str] = mapped_column(Text, nullable=False)
    numero: Mapped[int] = mapped_column(BigInteger, nullable=False)
    hash_sha256: Mapped[str] = mapped_column(Text, nullable=False)
    url_storage: Mapped[str | None] = mapped_column(Text)
    emitido_por: Mapped[uuid.UUID] = mapped_column(ForeignKey("persona.id"), nullable=False)
    anulado_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    anulado_por: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("persona.id"))
    created_at: Mapped[datetime] = _created_at()

    __table_args__ = (
        CheckConstraint(
            "tipo IN ('recibo','cronograma','mutuo','pagare','conformidad_novacion')",
            name="documento_emitido_tipo_check",
        ),
        UniqueConstraint("tipo", "numero", name="documento_emitido_tipo_numero_uq"),
    )


class LiquidacionComision(Base):
    __tablename__ = "liquidacion_comision"
    id: Mapped[uuid.UUID] = uuid_pk()
    vendedor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("persona.id"), nullable=False)
    periodo_desde: Mapped[date] = mapped_column(Date, nullable=False)
    periodo_hasta: Mapped[date] = mapped_column(Date, nullable=False)
    monto_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    estado: Mapped[str] = mapped_column(Text, nullable=False, server_default="borrador")
    aprobada_por: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("persona.id"))
    aprobada_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    egreso_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("movimiento_caja.id"))
    created_at: Mapped[datetime] = _created_at()

    __table_args__ = (
        CheckConstraint(
            "estado IN ('borrador','aprobada','pagada')",
            name="liquidacion_comision_estado_check",
        ),
    )


class LiquidacionDetalle(Base):
    __tablename__ = "liquidacion_detalle"
    id: Mapped[uuid.UUID] = uuid_pk()
    liquidacion_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("liquidacion_comision.id"), nullable=False
    )
    comision_devengo_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("comision_devengo.id"), nullable=False
    )
    monto: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
