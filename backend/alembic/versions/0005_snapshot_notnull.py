"""F1d hardening — snapshot_cartera.fecha_corte NOT NULL.

Sincroniza la DB con el modelo ORM: fecha_corte es la clave del upsert idempotente
(UNIQUE snapshot_cartera_fecha_corte_uq creada en 0004) y nunca puede ser NULL.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0005_snapshot_nn"
down_revision: str | None = "0004_f1d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "snapshot_cartera", "fecha_corte", existing_type=sa.Date(), nullable=False
    )


def downgrade() -> None:
    op.alter_column(
        "snapshot_cartera", "fecha_corte", existing_type=sa.Date(), nullable=True
    )
