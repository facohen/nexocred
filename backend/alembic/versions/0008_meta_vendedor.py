"""meta_vendedor: metas de colocación por vendedor y período"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0008_meta_vendedor"
down_revision: str | None = "0007_cuota_estado_cancelada"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "meta_vendedor",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("uuidv7()"),
        ),
        sa.Column(
            "vendedor_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("usuario.id"),
            nullable=False,
        ),
        sa.Column("periodo", sa.Text(), nullable=False),
        sa.Column("monto_meta", sa.Numeric(14, 2), nullable=False),
        sa.Column("cantidad_meta", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "vendedor_id", "periodo", name="meta_vendedor_vendedor_periodo_uq"
        ),
        sa.CheckConstraint("monto_meta >= 0", name="meta_vendedor_monto_no_negativo"),
        sa.CheckConstraint(
            "periodo ~ '^[0-9]{4}-[0-9]{2}$'", name="meta_vendedor_periodo_formato"
        ),
    )


def downgrade() -> None:
    op.drop_table("meta_vendedor")
