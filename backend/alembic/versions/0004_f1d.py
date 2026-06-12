"""F1d — tesoreria, La Torre, workflows y documentos.

Extiende los stubs/tablas de F1a/F1b/F1c (NO los recrea) con:
- aporte_retiro: movimientos de capital (aportes/retiros) asentados en caja.
- documento_numero: contador transaccional por tipo de documento.
- workflow_ejecucion.dedupe_key + UNIQUE(regla_id, dedupe_key) para idempotencia.
- snapshot_cartera UNIQUE(fecha_corte) para upsert idempotente del job.
- documento_emitido UNIQUE(tipo, numero) (si faltara).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0004_f1d"
down_revision: str | None = "0003_f1c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID = postgresql.UUID(as_uuid=True)
UUID_PK = sa.text("uuidv7()")


def _ts() -> sa.Column:
    return sa.Column(
        "created_at",
        sa.DateTime(timezone=True),
        server_default=sa.text("now()"),
        nullable=False,
    )


def upgrade() -> None:
    # ---------- aporte_retiro ----------
    op.create_table(
        "aporte_retiro",
        sa.Column("id", UUID, primary_key=True, server_default=UUID_PK),
        sa.Column("tipo", sa.Text(), nullable=False),
        sa.Column("monto", sa.Numeric(16, 2), nullable=False),
        sa.Column("fecha_negocio", sa.Date(), nullable=False),
        sa.Column("caja_id", UUID, sa.ForeignKey("caja.id"), nullable=True),
        sa.Column(
            "movimiento_id", UUID, sa.ForeignKey("movimiento_caja.id"), nullable=True
        ),
        sa.Column("inversor", sa.Text(), nullable=True),
        sa.Column("nota", sa.Text(), nullable=True),
        sa.Column("created_by", UUID, nullable=True),
        _ts(),
        sa.CheckConstraint(
            "tipo IN ('aporte','retiro')", name="aporte_retiro_tipo_check"
        ),
    )

    # ---------- documento_numero (contador por tipo) ----------
    op.create_table(
        "documento_numero",
        sa.Column("tipo", sa.Text(), primary_key=True),
        sa.Column("ultimo", sa.BigInteger(), nullable=False, server_default="0"),
    )

    # ---------- workflow_ejecucion deltas ----------
    op.add_column(
        "workflow_ejecucion", sa.Column("dedupe_key", sa.Text(), nullable=True)
    )
    op.create_unique_constraint(
        "workflow_ejecucion_regla_dedupe_uq",
        "workflow_ejecucion",
        ["regla_id", "dedupe_key"],
    )

    # ---------- snapshot_cartera UNIQUE(fecha_corte) ----------
    op.create_unique_constraint(
        "snapshot_cartera_fecha_corte_uq", "snapshot_cartera", ["fecha_corte"]
    )

    # documento_emitido UNIQUE(tipo, numero) ya existe en el stub F1a; no-op aqui.

    # ---------- documento_emitido: emitido_por/anulado_por apuntan al USUARIO ----------
    # Desviacion documentada: el DDL ilustrativo referenciaba persona(id), pero el actor
    # que emite/anula es un usuario del sistema (consistente con auditoria y comisiones).
    op.drop_constraint(
        "documento_emitido_emitido_por_fkey", "documento_emitido", type_="foreignkey"
    )
    op.drop_constraint(
        "documento_emitido_anulado_por_fkey", "documento_emitido", type_="foreignkey"
    )
    op.create_foreign_key(
        "documento_emitido_emitido_por_fkey", "documento_emitido", "usuario",
        ["emitido_por"], ["id"],
    )
    op.create_foreign_key(
        "documento_emitido_anulado_por_fkey", "documento_emitido", "usuario",
        ["anulado_por"], ["id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "documento_emitido_emitido_por_fkey", "documento_emitido", type_="foreignkey"
    )
    op.drop_constraint(
        "documento_emitido_anulado_por_fkey", "documento_emitido", type_="foreignkey"
    )
    op.create_foreign_key(
        "documento_emitido_emitido_por_fkey", "documento_emitido", "persona",
        ["emitido_por"], ["id"],
    )
    op.create_foreign_key(
        "documento_emitido_anulado_por_fkey", "documento_emitido", "persona",
        ["anulado_por"], ["id"],
    )
    op.drop_constraint(
        "snapshot_cartera_fecha_corte_uq", "snapshot_cartera", type_="unique"
    )
    op.drop_constraint(
        "workflow_ejecucion_regla_dedupe_uq", "workflow_ejecucion", type_="unique"
    )
    op.drop_column("workflow_ejecucion", "dedupe_key")
    op.drop_table("documento_numero")
    op.drop_table("aporte_retiro")
