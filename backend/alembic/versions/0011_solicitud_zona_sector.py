"""solicitud_credito: zona_id y sector_id (nullable)"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision: str = "0011_solicitud_zona_sector"
down_revision: str | None = "0010_persona_ubicacion_fk"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("solicitud_credito", sa.Column("zona_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("zona.id"), nullable=True))
    op.add_column("solicitud_credito", sa.Column("sector_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("sector.id"), nullable=True))


def downgrade() -> None:
    op.drop_column("solicitud_credito", "sector_id")
    op.drop_column("solicitud_credito", "zona_id")
