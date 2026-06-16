"""Interaccion enriquecida: tema, canal, disposicion, credito, proximo_paso.

Revision ID: 0013_interaccion_crm
Revises: 0012_promesa_pago
Create Date: 2026-06-16
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0013_interaccion_crm"
down_revision = "0012_promesa_pago"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("interaccion", sa.Column(
        "tema_id", postgresql.UUID(as_uuid=True),
        sa.ForeignKey("tema.id"), nullable=True,
    ))
    op.add_column("interaccion", sa.Column(
        "canal_id", postgresql.UUID(as_uuid=True),
        sa.ForeignKey("canal.id"), nullable=True,
    ))
    op.add_column("interaccion", sa.Column(
        "disposicion_id", postgresql.UUID(as_uuid=True),
        sa.ForeignKey("disposicion.id"), nullable=True,
    ))
    op.add_column("interaccion", sa.Column(
        "credito_id", postgresql.UUID(as_uuid=True),
        sa.ForeignKey("prestamo.id"), nullable=True,
    ))
    op.add_column("interaccion", sa.Column(
        "proximo_paso_fecha", sa.Date, nullable=True,
    ))
    op.add_column("interaccion", sa.Column(
        "proximo_paso_nota", sa.Text, nullable=True,
    ))


def downgrade() -> None:
    op.drop_column("interaccion", "proximo_paso_nota")
    op.drop_column("interaccion", "proximo_paso_fecha")
    op.drop_column("interaccion", "credito_id")
    op.drop_column("interaccion", "disposicion_id")
    op.drop_column("interaccion", "canal_id")
    op.drop_column("interaccion", "tema_id")
