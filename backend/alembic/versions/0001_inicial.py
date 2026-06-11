"""schema inicial F1a — schema completo + deltas + indices BRIN/GIN + idempotency + auditoria

Revision ID: 0001_inicial
Revises:
Create Date: 2026-06-11

Migracion hand-authored (no autogenerate): controla DDL especifico de Postgres 18
(`uuidv7()` server default, BRIN/GIN, CHECK constraints).

Tablas propias de F1a (schema completo): usuario, rol, usuario_rol, persona,
persona_referencia, persona_marca, persona_deuda_bcra, producto_credito,
producto_version, gasto_originacion, perfil_pricing, matriz_tasa, matriz_comision,
auditoria_evento, idempotency_key.

Tablas stub (FK-targets de etapas posteriores M02-M13), creadas con columnas minimas
declaradas por la spec §2; cada etapa posterior las extiende via nuevas migraciones:
solicitud_credito, prestamo, cuota, ruta_diaria, parada_ruta, movimiento_caja, pago,
imputacion, comision_devengo, snapshot_cartera, tarea, incidente, alerta,
workflow_regla, workflow_ejecucion, documento_emitido, liquidacion_comision,
liquidacion_detalle.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0001_inicial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID_PK = sa.text("uuidv7()")


def _uuid_pk() -> sa.Column:
    return sa.Column(
        "id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=UUID_PK
    )


def _created_at() -> sa.Column:
    return sa.Column(
        "created_at",
        sa.DateTime(timezone=True),
        nullable=False,
        server_default=sa.text("now()"),
    )


def _updated_at() -> sa.Column:
    return sa.Column(
        "updated_at",
        sa.DateTime(timezone=True),
        nullable=False,
        server_default=sa.text("now()"),
    )


def upgrade() -> None:
    # En Postgres 16/17 habilitar extension pg_uuidv7; en 18 uuidv7() es nativo.
    op.execute("DO $$ BEGIN PERFORM uuidv7(); EXCEPTION WHEN undefined_function THEN "
               "CREATE EXTENSION IF NOT EXISTS pg_uuidv7; END $$;")

    # ---- M12: rol / usuario / usuario_rol ----
    op.create_table(
        "rol",
        _uuid_pk(),
        sa.Column("nombre", sa.Text(), nullable=False, unique=True),
        sa.Column("descripcion", sa.Text()),
        _created_at(),
    )
    op.create_table(
        "usuario",
        _uuid_pk(),
        sa.Column("email", sa.Text(), nullable=False, unique=True),
        sa.Column("nombre", sa.Text(), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        _created_at(),
        _updated_at(),
    )
    op.create_table(
        "usuario_rol",
        sa.Column(
            "usuario_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("usuario.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "rol_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("rol.id", ondelete="CASCADE"),
            primary_key=True,
        ),
    )

    # ---- M01: persona ----
    op.create_table(
        "persona",
        _uuid_pk(),
        sa.Column("apellido", sa.Text(), nullable=False),
        sa.Column("nombre", sa.Text(), nullable=False),
        sa.Column("dni", sa.Text(), nullable=False),
        sa.Column("cuil", sa.CHAR(11), nullable=False, unique=True),
        sa.Column("fecha_nac", sa.Date(), nullable=False),
        sa.Column("estado_civil", sa.Text(), nullable=False),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("telefono", sa.Text(), nullable=False),
        sa.Column("domicilio_calle", sa.Text(), nullable=False),
        sa.Column("domicilio_numero", sa.Text()),
        sa.Column("domicilio_piso", sa.Text()),
        sa.Column("domicilio_localidad", sa.Text(), nullable=False),
        sa.Column(
            "domicilio_provincia",
            sa.Text(),
            nullable=False,
            server_default="Buenos Aires",
        ),
        sa.Column("observaciones_domicilio", sa.Text()),
        sa.Column("tipo_vivienda", sa.Text(), nullable=False),
        sa.Column("ingresos_declarados", sa.Numeric(14, 2), nullable=False),
        sa.Column(
            "ingresos_en_blanco", sa.Numeric(14, 2), nullable=False, server_default="0"
        ),
        sa.Column("ingresos_totales", sa.Numeric(14, 2), nullable=False),
        sa.Column("empleador", sa.Text()),
        sa.Column("cuit_empleador", sa.CHAR(11)),
        sa.Column("fecha_ingreso_laboral", sa.Date()),
        sa.Column(
            "referido_por_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("persona.id"),
        ),
        sa.Column("redes_sociales", postgresql.JSONB()),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        _created_at(),
        _updated_at(),
        sa.CheckConstraint(
            "estado_civil IN ('soltero','casado','divorciado','viudo','union_convivencial')",
            name="persona_estado_civil_check",
        ),
        sa.CheckConstraint(
            "tipo_vivienda IN ('propia','alquilada','familiar','prestada')",
            name="persona_tipo_vivienda_check",
        ),
    )
    op.create_index("persona_cuil_idx", "persona", ["cuil"])
    op.create_index("persona_dni_idx", "persona", ["dni"])
    op.create_index("persona_nombre_idx", "persona", ["apellido", "nombre"])
    # GIN para busqueda rapida por nombre (spec §4)
    op.execute(
        "CREATE INDEX persona_nombre_gin ON persona USING gin "
        "(to_tsvector('spanish', apellido || ' ' || nombre))"
    )

    op.create_table(
        "persona_referencia",
        _uuid_pk(),
        sa.Column(
            "persona_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("persona.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("nombre", sa.Text(), nullable=False),
        sa.Column("apellido", sa.Text()),
        sa.Column("telefono", sa.Text(), nullable=False),
        sa.Column("vinculo", sa.Text(), nullable=False),
        sa.Column(
            "es_alternativo", sa.Boolean(), nullable=False, server_default=sa.text("true")
        ),
        sa.Column("notas", sa.Text()),
        _created_at(),
        sa.CheckConstraint(
            "vinculo IN ('padre','madre','hermano','conyuge','pareja','hijo',"
            "'vecino','companero','amigo','otro')",
            name="persona_referencia_vinculo_check",
        ),
    )

    op.create_table(
        "persona_marca",
        _uuid_pk(),
        sa.Column(
            "persona_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("persona.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("tipo", sa.Text(), nullable=False),
        sa.Column("motivo", sa.Text()),
        sa.Column(
            "creada_por", postgresql.UUID(as_uuid=True), sa.ForeignKey("usuario.id")
        ),
        sa.Column("activa", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        _created_at(),
        sa.CheckConstraint(
            "tipo IN ('operativa','lista_negra','vip','observado')",
            name="persona_marca_tipo_check",
        ),
    )

    op.create_table(
        "persona_deuda_bcra",
        _uuid_pk(),
        sa.Column(
            "persona_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("persona.id"),
            nullable=False,
        ),
        sa.Column("entidad", sa.Text(), nullable=False),
        sa.Column("monto", sa.Numeric(14, 2), nullable=False),
        sa.Column("situacion", sa.SmallInteger(), nullable=False),
        sa.Column("fecha_informe", sa.Date(), nullable=False),
        sa.Column("fuente", sa.Text(), nullable=False, server_default="api_bcra"),
        _created_at(),
        sa.CheckConstraint(
            "situacion BETWEEN 1 AND 6", name="persona_deuda_bcra_situacion_check"
        ),
    )
    op.create_index(
        "persona_deuda_bcra_persona_idx", "persona_deuda_bcra", ["persona_id"]
    )

    # ---- M15: catalogo ----
    op.create_table(
        "producto_credito",
        _uuid_pk(),
        sa.Column("nombre", sa.Text(), nullable=False),
        sa.Column("descripcion", sa.Text()),
        sa.Column("estado", sa.Text(), nullable=False, server_default="borrador"),
        sa.Column("version_vigente", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        _created_at(),
        _updated_at(),
        sa.CheckConstraint(
            "estado IN ('borrador','activo','discontinuado')",
            name="producto_credito_estado_check",
        ),
    )
    op.create_table(
        "producto_version",
        _uuid_pk(),
        sa.Column(
            "producto_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("producto_credito.id"),
            nullable=False,
        ),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("periodicidad", sa.Text(), nullable=False, server_default="mensual"),
        sa.Column("plazos_permitidos", sa.Text()),
        sa.Column("monto_minimo", sa.Numeric(14, 2)),
        sa.Column("monto_maximo", sa.Numeric(14, 2)),
        sa.Column("snapshot_json", sa.Text()),
        sa.Column("creada_por", postgresql.UUID(as_uuid=True), sa.ForeignKey("usuario.id")),
        _created_at(),
        sa.UniqueConstraint("producto_id", "version", name="producto_version_uq"),
    )
    op.create_table(
        "gasto_originacion",
        _uuid_pk(),
        sa.Column(
            "producto_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("producto_credito.id"),
            nullable=False,
        ),
        sa.Column("nombre", sa.Text(), nullable=False),
        sa.Column("tipo", sa.Text(), nullable=False),
        sa.Column("valor", sa.Numeric(10, 4), nullable=False),
        sa.Column(
            "financiado", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
        sa.Column("jurisdiccion", sa.Text()),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        _created_at(),
        sa.CheckConstraint(
            "tipo IN ('porcentaje','fijo')", name="gasto_originacion_tipo_check"
        ),
    )
    op.create_table(
        "perfil_pricing",
        _uuid_pk(),
        sa.Column("nombre", sa.Text(), nullable=False, unique=True),
        sa.Column("descripcion", sa.Text()),
        sa.Column("orden", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        _created_at(),
    )
    op.create_table(
        "matriz_tasa",
        _uuid_pk(),
        sa.Column(
            "producto_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("producto_credito.id"),
            nullable=False,
        ),
        sa.Column(
            "perfil_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("perfil_pricing.id"),
            nullable=False,
        ),
        sa.Column("plazo", sa.Integer(), nullable=False),
        sa.Column("tasa", sa.Numeric(10, 4), nullable=False),
        sa.Column(
            "vigente_desde",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        _created_at(),
        sa.UniqueConstraint("producto_id", "perfil_id", "plazo", name="matriz_tasa_uq"),
    )
    op.create_table(
        "matriz_comision",
        _uuid_pk(),
        sa.Column(
            "producto_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("producto_credito.id"),
            nullable=False,
        ),
        sa.Column(
            "perfil_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("perfil_pricing.id"),
            nullable=False,
        ),
        sa.Column("comision", sa.Numeric(10, 4), nullable=False),
        sa.Column(
            "vigente_desde",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        _created_at(),
        sa.UniqueConstraint("producto_id", "perfil_id", name="matriz_comision_uq"),
    )

    # ---- auditoria / idempotencia ----
    op.create_table(
        "auditoria_evento",
        _uuid_pk(),
        sa.Column("actor_id", postgresql.UUID(as_uuid=True)),
        sa.Column("accion", sa.String(100), nullable=False),
        sa.Column("entidad", sa.String(100), nullable=False),
        sa.Column("entidad_id", sa.String(64)),
        sa.Column("resultado", sa.String(20), nullable=False),
        sa.Column("ip", sa.String(64)),
        sa.Column("user_agent", sa.Text()),
        sa.Column("metadata_json", postgresql.JSONB()),
        _created_at(),
    )
    op.create_index("auditoria_evento_accion_idx", "auditoria_evento", ["accion"])
    op.create_table(
        "idempotency_key",
        _uuid_pk(),
        sa.Column("clave", sa.String(255), nullable=False),
        sa.Column("operacion", sa.String(100), nullable=False),
        sa.Column("respuesta_json", sa.Text()),
        _created_at(),
        sa.UniqueConstraint("clave", "operacion", name="idempotency_clave_op_uq"),
    )

    # ---- stubs (FK-targets etapas posteriores) ----
    op.create_table(
        "solicitud_credito",
        _uuid_pk(),
        sa.Column(
            "persona_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("persona.id"),
            nullable=False,
        ),
        sa.Column(
            "producto_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("producto_credito.id"), nullable=False,
        ),
        sa.Column("monto", sa.Numeric(14, 2)),
        sa.Column("estado", sa.Text(), nullable=False, server_default="borrador"),
        sa.Column("vendedor_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("usuario.id")),
        _created_at(),
    )
    op.create_table(
        "prestamo",
        _uuid_pk(),
        sa.Column(
            "persona_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("persona.id"),
            nullable=False,
        ),
        sa.Column(
            "producto_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("producto_credito.id"), nullable=False,
        ),
        sa.Column(
            "solicitud_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("solicitud_credito.id"),
        ),
        sa.Column("capital", sa.Numeric(14, 2)),
        sa.Column("estado", sa.Text(), nullable=False, server_default="vigente"),
        _created_at(),
    )
    op.create_table(
        "cuota",
        _uuid_pk(),
        sa.Column(
            "prestamo_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("prestamo.id"),
            nullable=False,
        ),
        sa.Column("numero", sa.Integer(), nullable=False),
        sa.Column("vencimiento", sa.Date()),
        sa.Column("capital", sa.Numeric(14, 2)),
        sa.Column("interes", sa.Numeric(14, 2)),
        sa.Column("estado", sa.Text(), nullable=False, server_default="pendiente"),
        _created_at(),
    )
    op.create_table(
        "ruta_diaria",
        _uuid_pk(),
        sa.Column("cobrador_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("usuario.id")),
        sa.Column("fecha", sa.Date()),
        sa.Column("estado", sa.Text(), nullable=False, server_default="abierta"),
        _created_at(),
    )
    op.create_table(
        "parada_ruta",
        _uuid_pk(),
        sa.Column(
            "ruta_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ruta_diaria.id"),
            nullable=False,
        ),
        sa.Column(
            "prestamo_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("prestamo.id"),
            nullable=False,
        ),
        sa.Column("orden", sa.Integer(), nullable=False),
        sa.Column("resultado", sa.Text()),
        sa.Column("monto_cobrado", sa.Numeric(14, 2)),
        sa.Column("foto_url", sa.Text()),
        sa.Column("lat", sa.Numeric(10, 7)),
        sa.Column("lng", sa.Numeric(10, 7)),
        sa.Column("notas", sa.Text()),
        sa.Column("visitada_en", sa.DateTime(timezone=True)),
        _created_at(),
        sa.CheckConstraint(
            "resultado IS NULL OR resultado IN "
            "('pago','parcial','promesa','ausente','se_niega','cancelado')",
            name="parada_ruta_resultado_check",
        ),
    )
    op.create_table(
        "movimiento_caja",
        _uuid_pk(),
        sa.Column("caja_id", postgresql.UUID(as_uuid=True)),
        sa.Column("tipo", sa.Text()),
        sa.Column("monto", sa.Numeric(14, 2)),
        sa.Column("fecha_negocio", sa.Date()),
        _created_at(),
    )
    op.create_table(
        "pago",
        _uuid_pk(),
        sa.Column(
            "prestamo_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("prestamo.id"),
            nullable=False,
        ),
        sa.Column(
            "parada_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("parada_ruta.id")
        ),
        sa.Column(
            "caja_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("movimiento_caja.id")
        ),
        sa.Column("monto", sa.Numeric(14, 2)),
        sa.Column("estado", sa.Text(), nullable=False, server_default="registrado"),
        sa.Column("fecha_negocio", sa.Date()),
        _created_at(),
    )
    op.create_table(
        "imputacion",
        _uuid_pk(),
        sa.Column(
            "pago_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("pago.id"),
            nullable=False,
        ),
        sa.Column("cuota_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("cuota.id")),
        sa.Column("concepto", sa.Text()),
        sa.Column("monto", sa.Numeric(14, 2)),
        sa.Column("orden_waterfall", sa.Integer()),
        _created_at(),
    )
    op.create_table(
        "comision_devengo",
        _uuid_pk(),
        sa.Column(
            "prestamo_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("prestamo.id"),
            nullable=False,
        ),
        sa.Column("vendedor_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("persona.id")),
        sa.Column("monto", sa.Numeric(14, 2)),
        sa.Column("estado", sa.Text(), nullable=False, server_default="devengada"),
        _created_at(),
    )
    op.create_table(
        "snapshot_cartera",
        _uuid_pk(),
        sa.Column("fecha_corte", sa.Date()),
        sa.Column("prestamos_vigentes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("prestamos_en_mora", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("colocacion_mes", sa.Numeric(16, 2), nullable=False, server_default="0"),
        sa.Column(
            "intereses_cobrados_mes", sa.Numeric(16, 2), nullable=False, server_default="0"
        ),
        sa.Column(
            "punitorios_cobrados_mes", sa.Numeric(16, 2), nullable=False, server_default="0"
        ),
        sa.Column(
            "capital_disponible", sa.Numeric(16, 2), nullable=False, server_default="0"
        ),
        _created_at(),
    )
    op.create_table(
        "tarea",
        _uuid_pk(),
        sa.Column("persona_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("persona.id")),
        sa.Column("operador_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("usuario.id")),
        sa.Column("titulo", sa.Text()),
        sa.Column("estado", sa.Text(), nullable=False, server_default="pendiente"),
        _created_at(),
    )
    op.create_table(
        "incidente",
        _uuid_pk(),
        sa.Column("persona_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("persona.id")),
        sa.Column("tipo", sa.Text()),
        sa.Column("estado", sa.Text(), nullable=False, server_default="abierto"),
        _created_at(),
    )
    op.create_table(
        "alerta",
        _uuid_pk(),
        sa.Column("prestamo_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("prestamo.id")),
        sa.Column("persona_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("persona.id")),
        sa.Column("tipo", sa.Text()),
        sa.Column("estado", sa.Text(), nullable=False, server_default="activa"),
        _created_at(),
    )
    op.create_table(
        "workflow_regla",
        _uuid_pk(),
        sa.Column("nombre", sa.Text(), nullable=False),
        sa.Column("familia", sa.Text(), nullable=False),
        sa.Column("disparador", sa.Text(), nullable=False),
        sa.Column("condicion_json", postgresql.JSONB()),
        sa.Column("accion", sa.Text(), nullable=False),
        sa.Column("accion_params", postgresql.JSONB()),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("orden", sa.Integer(), nullable=False, server_default="0"),
        _created_at(),
        sa.CheckConstraint(
            "familia IN ('cobranza','novacion','crm')", name="workflow_regla_familia_check"
        ),
    )
    op.create_table(
        "workflow_ejecucion",
        _uuid_pk(),
        sa.Column(
            "regla_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workflow_regla.id"),
            nullable=False,
        ),
        sa.Column("prestamo_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("prestamo.id")),
        sa.Column("persona_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("persona.id")),
        sa.Column("resultado", sa.Text(), nullable=False),
        sa.Column("detalle", sa.Text()),
        sa.Column(
            "ejecutado_en", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint(
            "resultado IN ('ok','error','omitido')",
            name="workflow_ejecucion_resultado_check",
        ),
    )
    op.create_table(
        "documento_emitido",
        _uuid_pk(),
        sa.Column(
            "prestamo_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("prestamo.id"),
            nullable=False,
        ),
        sa.Column("tipo", sa.Text(), nullable=False),
        sa.Column("numero", sa.BigInteger(), nullable=False),
        sa.Column("hash_sha256", sa.Text(), nullable=False),
        sa.Column("url_storage", sa.Text()),
        sa.Column(
            "emitido_por", postgresql.UUID(as_uuid=True), sa.ForeignKey("persona.id"),
            nullable=False,
        ),
        sa.Column("anulado_en", sa.DateTime(timezone=True)),
        sa.Column("anulado_por", postgresql.UUID(as_uuid=True), sa.ForeignKey("persona.id")),
        _created_at(),
        sa.CheckConstraint(
            "tipo IN ('recibo','cronograma','mutuo','pagare','conformidad_novacion')",
            name="documento_emitido_tipo_check",
        ),
        sa.UniqueConstraint("tipo", "numero", name="documento_emitido_tipo_numero_uq"),
    )
    op.create_table(
        "liquidacion_comision",
        _uuid_pk(),
        sa.Column(
            "vendedor_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("persona.id"),
            nullable=False,
        ),
        sa.Column("periodo_desde", sa.Date(), nullable=False),
        sa.Column("periodo_hasta", sa.Date(), nullable=False),
        sa.Column("monto_total", sa.Numeric(14, 2), nullable=False),
        sa.Column("estado", sa.Text(), nullable=False, server_default="borrador"),
        sa.Column("aprobada_por", postgresql.UUID(as_uuid=True), sa.ForeignKey("persona.id")),
        sa.Column("aprobada_en", sa.DateTime(timezone=True)),
        sa.Column(
            "egreso_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("movimiento_caja.id")
        ),
        _created_at(),
        sa.CheckConstraint(
            "estado IN ('borrador','aprobada','pagada')",
            name="liquidacion_comision_estado_check",
        ),
    )
    op.create_table(
        "liquidacion_detalle",
        _uuid_pk(),
        sa.Column(
            "liquidacion_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("liquidacion_comision.id"), nullable=False,
        ),
        sa.Column(
            "comision_devengo_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("comision_devengo.id"), nullable=False,
        ),
        sa.Column("monto", sa.Numeric(14, 2), nullable=False),
    )

    # ---- indices BRIN sobre created_at en tablas de ledger (spec §4) ----
    for tabla in ("pago", "imputacion", "movimiento_caja", "comision_devengo"):
        op.execute(
            f"CREATE INDEX {tabla}_created_at_brin ON {tabla} USING brin (created_at)"
        )


def downgrade() -> None:
    for tabla in (
        "liquidacion_detalle", "liquidacion_comision", "documento_emitido",
        "workflow_ejecucion", "workflow_regla", "alerta", "incidente", "tarea",
        "snapshot_cartera", "comision_devengo", "imputacion", "pago", "movimiento_caja",
        "parada_ruta", "ruta_diaria", "cuota", "prestamo", "solicitud_credito",
        "idempotency_key", "auditoria_evento",
        "matriz_comision", "matriz_tasa", "perfil_pricing", "gasto_originacion",
        "producto_version", "producto_credito",
        "persona_deuda_bcra", "persona_marca", "persona_referencia", "persona",
        "usuario_rol", "usuario", "rol",
    ):
        op.drop_table(tabla)
