"""criticos: unique parcial prestamo.solicitud_id"""

from alembic import op
import sqlalchemy as sa

revision: str = "0006_criticos"
down_revision: str | None = "0005_snapshot_nn"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "prestamo_solicitud_idx",
        "prestamo",
        ["solicitud_id"],
        unique=True,
        postgresql_where=sa.text("solicitud_id IS NOT NULL"),
        if_not_exists=True,
    )


def downgrade() -> None:
    op.drop_index("prestamo_solicitud_idx", table_name="prestamo", if_exists=True)
