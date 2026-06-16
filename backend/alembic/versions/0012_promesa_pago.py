"""Espina de cobranzas: promesa_pago + dedupe en tarea.

Revision ID: 0012
Revises: 0011
Create Date: 2026-06-16
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0012_promesa_pago"
down_revision = "0011_solicitud_zona_sector"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "promesa_pago",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("uuidv7()"), nullable=False),
        sa.Column("prestamo_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("prestamo.id"), nullable=False),
        sa.Column("cuota_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("cuota.id"), nullable=True),
        sa.Column("monto_prometido", sa.Numeric(14, 2), nullable=False),
        sa.Column("monto_exigible_base", sa.Numeric(14, 2), nullable=True),
        sa.Column("fecha_prometida", sa.Date, nullable=False),
        sa.Column("estado", sa.Text, nullable=False, server_default="vigente"),
        sa.Column("canal_origen", sa.Text, nullable=True),
        sa.Column("interaccion_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("interaccion.id"), nullable=True),
        sa.Column("parada_ruta_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("parada_ruta.id"), nullable=True),
        sa.Column("creada_por", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("usuario.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "estado IN ('vigente','cumplida','parcial','rota')",
            name="promesa_pago_estado_check",
        ),
        sa.CheckConstraint(
            "canal_origen IS NULL OR canal_origen IN ('call','campo')",
            name="promesa_pago_canal_origen_check",
        ),
        sa.CheckConstraint(
            "num_nonnulls(interaccion_id, parada_ruta_id) = 1",
            name="promesa_pago_origen_xor_check",
        ),
    )
    op.create_index("ix_promesa_pago_prestamo_estado",
                    "promesa_pago", ["prestamo_id", "estado"])

    # tarea: agregar promesa_id y dedupe_key
    op.add_column("tarea", sa.Column(
        "promesa_id", postgresql.UUID(as_uuid=True),
        sa.ForeignKey("promesa_pago.id"), nullable=True,
    ))
    op.add_column("tarea", sa.Column("dedupe_key", sa.Text, nullable=True))
    op.create_index("ix_tarea_dedupe", "tarea", ["dedupe_key", "origen"],
                    postgresql_where=sa.text("estado = 'pendiente' AND dedupe_key IS NOT NULL"))


def downgrade() -> None:
    op.drop_index("ix_tarea_dedupe", table_name="tarea")
    op.drop_column("tarea", "dedupe_key")
    op.drop_column("tarea", "promesa_id")
    op.drop_index("ix_promesa_pago_prestamo_estado", table_name="promesa_pago")
    op.drop_table("promesa_pago")
