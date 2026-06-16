"""persona: FK provincia_id y localidad_id (nullable)"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision: str = "0010_persona_ubicacion_fk"
down_revision: str | None = "0009_maestros"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("persona", sa.Column("provincia_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("provincia.id"), nullable=True))
    op.add_column("persona", sa.Column("localidad_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("localidad.id"), nullable=True))


def downgrade() -> None:
    op.drop_column("persona", "localidad_id")
    op.drop_column("persona", "provincia_id")
