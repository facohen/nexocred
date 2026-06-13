"""C3: add 'cancelada' to cuota.estado check constraint"""


from alembic import op

revision: str = "0007_cuota_estado_cancelada"
down_revision: str | None = "0006_criticos"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("cuota_estado_check", "cuota", type_="check")
    op.create_check_constraint(
        "cuota_estado_check",
        "cuota",
        "estado IN ('pendiente','parcial','pagada','tolerada','cancelada')",
    )


def downgrade() -> None:
    op.drop_constraint("cuota_estado_check", "cuota", type_="check")
    # Filas con 'cancelada' no son válidas en el schema anterior; se marcan
    # como 'pagada' (cuota cerrada) para no violar el constraint al revertir.
    op.execute("UPDATE cuota SET estado = 'pagada' WHERE estado = 'cancelada'")
    op.create_check_constraint(
        "cuota_estado_check",
        "cuota",
        "estado IN ('pendiente','parcial','pagada','tolerada')",
    )
