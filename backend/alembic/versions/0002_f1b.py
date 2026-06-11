"""F1b — extiende tablas financieras (prestamo/cuota/pago/imputacion/solicitud/caja)
   y crea caja/arqueo_caja/novacion/novacion_origen.

Revision ID: 0002_f1b
Revises: 0001_inicial
Create Date: 2026-06-11

Extiende los stubs de F1a (no los recrea) con las columnas que necesita el motor
financiero F1b: snapshot inmutable del prestamo, cronograma materializado con saldos,
idempotencia y contra-asientos de pago, waterfall persistido, scoring de solicitud,
y las tablas nuevas de caja/arqueo/novacion.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0002_f1b"
down_revision: str | None = "0001_inicial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID = postgresql.UUID(as_uuid=True)
UUID_PK = sa.text("uuidv7()")


def upgrade() -> None:
    # ---------- prestamo ----------
    op.add_column("prestamo", sa.Column("snapshot_terminos", postgresql.JSONB()))
    op.add_column("prestamo", sa.Column("fecha_desembolso", sa.Date()))
    op.add_column(
        "prestamo",
        sa.Column(
            "tasa_punitorio_diario",
            sa.Numeric(10, 4),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "prestamo",
        sa.Column("vendedor_id", UUID, sa.ForeignKey("usuario.id")),
    )
    op.add_column("prestamo", sa.Column("monto_desembolsado", sa.Numeric(14, 2)))
    op.create_check_constraint(
        "prestamo_estado_check",
        "prestamo",
        "estado IN ('vigente','en_mora','cancelado','novado','incobrable')",
    )

    # ---------- cuota ----------
    op.add_column(
        "cuota",
        sa.Column(
            "punitorio_acumulado",
            sa.Numeric(14, 2),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column("cuota", sa.Column("cuota", sa.Numeric(14, 2)))
    op.create_check_constraint(
        "cuota_estado_check",
        "cuota",
        "estado IN ('pendiente','parcial','pagada','tolerada')",
    )

    # ---------- pago ----------
    op.add_column("pago", sa.Column("idempotency_key", sa.String(255)))
    op.add_column("pago", sa.Column("canal", sa.Text()))
    op.add_column(
        "pago",
        sa.Column("corrige_pago_id", UUID, sa.ForeignKey("pago.id")),
    )
    op.add_column(
        "pago",
        sa.Column(
            "excedente", sa.Numeric(14, 2), nullable=False, server_default="0"
        ),
    )
    op.create_check_constraint(
        "pago_estado_check",
        "pago",
        "estado IN ('registrado','aplicado','a_aplicar','corregido')",
    )
    op.create_index(
        "pago_idem_uq",
        "pago",
        ["idempotency_key"],
        unique=True,
        postgresql_where=sa.text("idempotency_key IS NOT NULL"),
    )

    # ---------- imputacion ----------
    # orden_waterfall ya existe (nullable) desde 0001: lo hacemos NOT NULL DEFAULT 0.
    op.execute("UPDATE imputacion SET orden_waterfall = 0 WHERE orden_waterfall IS NULL")
    op.alter_column(
        "imputacion",
        "orden_waterfall",
        nullable=False,
        server_default="0",
    )
    op.add_column("imputacion", sa.Column("cuota_numero", sa.Integer()))

    # ---------- solicitud_credito ----------
    op.add_column(
        "solicitud_credito",
        sa.Column(
            "perfil_pricing_id", UUID, sa.ForeignKey("perfil_pricing.id")
        ),
    )
    op.add_column(
        "solicitud_credito", sa.Column("tasa_resuelta", sa.Numeric(10, 4))
    )
    op.add_column("solicitud_credito", sa.Column("score", sa.Integer()))
    op.add_column("solicitud_credito", sa.Column("motivo_rechazo", sa.Text()))
    op.add_column("solicitud_credito", sa.Column("cantidad_cuotas", sa.Integer()))
    op.create_check_constraint(
        "solicitud_credito_estado_check",
        "solicitud_credito",
        "estado IN ('borrador','en_analisis','aprobada','rechazada',"
        "'desistida','desembolsada')",
    )

    # ---------- caja ----------
    op.create_table(
        "caja",
        sa.Column("id", UUID, primary_key=True, server_default=UUID_PK),
        sa.Column("nombre", sa.Text(), nullable=False),
        sa.Column("tipo", sa.Text()),
        sa.Column(
            "saldo_teorico",
            sa.Numeric(14, 2),
            nullable=False,
            server_default="0",
        ),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )

    # movimiento_caja FK + extensiones
    op.create_foreign_key(
        "movimiento_caja_caja_id_fkey",
        "movimiento_caja",
        "caja",
        ["caja_id"],
        ["id"],
    )
    op.add_column("movimiento_caja", sa.Column("concepto", sa.Text()))
    op.add_column("movimiento_caja", sa.Column("categoria", sa.Text()))
    op.add_column(
        "movimiento_caja", sa.Column("contraparte_caja_id", UUID)
    )
    op.add_column(
        "movimiento_caja",
        sa.Column("pago_id", UUID, sa.ForeignKey("pago.id")),
    )
    op.add_column("movimiento_caja", sa.Column("referencia", sa.Text()))

    # ---------- arqueo_caja ----------
    op.create_table(
        "arqueo_caja",
        sa.Column("id", UUID, primary_key=True, server_default=UUID_PK),
        sa.Column(
            "caja_id", UUID, sa.ForeignKey("caja.id"), nullable=False
        ),
        sa.Column("fecha_negocio", sa.Date(), nullable=False),
        sa.Column("saldo_teorico", sa.Numeric(14, 2), nullable=False),
        sa.Column("saldo_fisico", sa.Numeric(14, 2), nullable=False),
        sa.Column("diferencia", sa.Numeric(14, 2), nullable=False),
        sa.Column("cerrado_por", UUID, sa.ForeignKey("usuario.id")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint(
            "caja_id", "fecha_negocio", name="arqueo_caja_caja_fecha_uq"
        ),
    )

    # ---------- novacion ----------
    op.create_table(
        "novacion",
        sa.Column("id", UUID, primary_key=True, server_default=UUID_PK),
        sa.Column("tipo", sa.Text(), nullable=False),
        sa.Column(
            "estado", sa.Text(), nullable=False, server_default="borrador"
        ),
        sa.Column(
            "nuevo_prestamo_id", UUID, sa.ForeignKey("prestamo.id")
        ),
        sa.Column("creado_por", UUID, sa.ForeignKey("usuario.id")),
        sa.Column("idempotency_key", sa.String(255)),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint(
            "tipo IN ('refinanciacion','consolidacion','transferencia',"
            "'repactar_rapido')",
            name="novacion_tipo_check",
        ),
        sa.CheckConstraint(
            "estado IN ('borrador','confirmada','anulada')",
            name="novacion_estado_check",
        ),
    )
    op.create_index(
        "novacion_idem_uq",
        "novacion",
        ["idempotency_key"],
        unique=True,
        postgresql_where=sa.text("idempotency_key IS NOT NULL"),
    )

    op.create_table(
        "novacion_origen",
        sa.Column("id", UUID, primary_key=True, server_default=UUID_PK),
        sa.Column(
            "novacion_id", UUID, sa.ForeignKey("novacion.id"), nullable=False
        ),
        sa.Column(
            "prestamo_id", UUID, sa.ForeignKey("prestamo.id"), nullable=False
        ),
    )


def downgrade() -> None:
    op.drop_table("novacion_origen")
    op.drop_index("novacion_idem_uq", table_name="novacion")
    op.drop_table("novacion")
    op.drop_table("arqueo_caja")
    op.drop_column("movimiento_caja", "referencia")
    op.drop_column("movimiento_caja", "pago_id")
    op.drop_column("movimiento_caja", "contraparte_caja_id")
    op.drop_column("movimiento_caja", "categoria")
    op.drop_column("movimiento_caja", "concepto")
    op.drop_constraint(
        "movimiento_caja_caja_id_fkey", "movimiento_caja", type_="foreignkey"
    )
    op.drop_table("caja")
    op.drop_constraint(
        "solicitud_credito_estado_check", "solicitud_credito", type_="check"
    )
    op.drop_column("solicitud_credito", "cantidad_cuotas")
    op.drop_column("solicitud_credito", "motivo_rechazo")
    op.drop_column("solicitud_credito", "score")
    op.drop_column("solicitud_credito", "tasa_resuelta")
    op.drop_column("solicitud_credito", "perfil_pricing_id")
    op.drop_column("imputacion", "cuota_numero")
    op.alter_column("imputacion", "orden_waterfall", nullable=True, server_default=None)
    op.drop_index("pago_idem_uq", table_name="pago")
    op.drop_constraint("pago_estado_check", "pago", type_="check")
    op.drop_column("pago", "excedente")
    op.drop_column("pago", "corrige_pago_id")
    op.drop_column("pago", "canal")
    op.drop_column("pago", "idempotency_key")
    op.drop_constraint("cuota_estado_check", "cuota", type_="check")
    op.drop_column("cuota", "cuota")
    op.drop_column("cuota", "punitorio_acumulado")
    op.drop_constraint("prestamo_estado_check", "prestamo", type_="check")
    op.drop_column("prestamo", "monto_desembolsado")
    op.drop_column("prestamo", "vendedor_id")
    op.drop_column("prestamo", "tasa_punitorio_diario")
    op.drop_column("prestamo", "fecha_desembolso")
    op.drop_column("prestamo", "snapshot_terminos")
