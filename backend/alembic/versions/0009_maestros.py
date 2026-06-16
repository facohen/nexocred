"""maestros: zonas, sectores, temas, canales, disposiciones, provincias, localidades, asignacion_vendedor"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0009_maestros"
down_revision: str | None = "0008_meta_vendedor"
branch_labels = None
depends_on = None

_PROVINCIAS = [
    ("AR-B", "Buenos Aires", 1),
    ("AR-C", "Ciudad Autónoma de Buenos Aires", 2),
    ("AR-K", "Catamarca", 3),
    ("AR-H", "Chaco", 4),
    ("AR-U", "Chubut", 5),
    ("AR-X", "Córdoba", 6),
    ("AR-W", "Corrientes", 7),
    ("AR-E", "Entre Ríos", 8),
    ("AR-P", "Formosa", 9),
    ("AR-Y", "Jujuy", 10),
    ("AR-L", "La Pampa", 11),
    ("AR-F", "La Rioja", 12),
    ("AR-M", "Mendoza", 13),
    ("AR-N", "Misiones", 14),
    ("AR-Q", "Neuquén", 15),
    ("AR-R", "Río Negro", 16),
    ("AR-A", "Salta", 17),
    ("AR-J", "San Juan", 18),
    ("AR-D", "San Luis", 19),
    ("AR-Z", "Santa Cruz", 20),
    ("AR-S", "Santa Fe", 21),
    ("AR-G", "Santiago del Estero", 22),
    ("AR-V", "Tierra del Fuego", 23),
    ("AR-T", "Tucumán", 24),
]

_SECTORES = [
    ("call_center", "Call Center", 1),
    ("web", "Web / Digital", 2),
    ("presencial", "Presencial", 3),
]

_DISPOSICIONES = [
    ("pago", "Pago recibido", True, 1),
    ("pago_parcial", "Pago parcial", True, 2),
    ("promesa", "Promesa de pago", False, 3),
    ("no_contesta", "No contesta", False, 4),
    ("numero_errado", "Número errado / inexistente", False, 5),
    ("buzon", "Buzón de voz", False, 6),
    ("se_niega", "Se niega a pagar", False, 7),
    ("ya_pago", "Ya pagó (verificar)", False, 8),
    ("disputa", "Disputa / reclamo", False, 9),
    ("contacto_tercero", "Contacto con tercero", False, 10),
    ("sin_gestion", "Sin gestión posible", False, 11),
]


def upgrade() -> None:
    # 1 — provincia
    op.create_table(
        "provincia",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuidv7()")),
        sa.Column("codigo", sa.Text(), nullable=False),
        sa.Column("nombre", sa.Text(), nullable=False),
        sa.Column("orden", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("codigo", name="provincia_codigo_uq"),
        sa.UniqueConstraint("nombre", name="provincia_nombre_uq"),
    )

    # 2 — localidad
    op.create_table(
        "localidad",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuidv7()")),
        sa.Column("provincia_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("provincia.id"), nullable=False),
        sa.Column("codigo", sa.Text(), nullable=True),
        sa.Column("nombre", sa.Text(), nullable=False),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("provincia_id", "nombre", name="localidad_provincia_nombre_uq"),
    )

    # 3 — catálogos planos
    for tabla in ("zona", "sector", "tema", "canal"):
        op.create_table(
            tabla,
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuidv7()")),
            sa.Column("codigo", sa.Text(), nullable=False),
            sa.Column("nombre", sa.Text(), nullable=False),
            sa.Column("orden", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("activo", sa.Boolean(), nullable=False, server_default="true"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.UniqueConstraint("codigo", name=f"{tabla}_codigo_uq"),
        )

    # 4 — disposicion (tiene genera_cobro)
    op.create_table(
        "disposicion",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuidv7()")),
        sa.Column("codigo", sa.Text(), nullable=False),
        sa.Column("nombre", sa.Text(), nullable=False),
        sa.Column("genera_cobro", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("orden", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("codigo", name="disposicion_codigo_uq"),
    )

    # 5 — asignacion_vendedor con índice parcial de unicidad
    op.create_table(
        "asignacion_vendedor",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuidv7()")),
        sa.Column("vendedor_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("usuario.id"), nullable=False),
        sa.Column("zona_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("zona.id"), nullable=False),
        sa.Column("sector_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("sector.id"), nullable=False),
        sa.Column("vigente_desde", sa.Date(), nullable=False),
        sa.Column("vigente_hasta", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(
        "asignacion_vendedor_vigente_uq",
        "asignacion_vendedor",
        ["vendedor_id"],
        unique=True,
        postgresql_where=sa.text("vigente_hasta IS NULL"),
    )

    # Precarga estable — 24 provincias
    prov_table = sa.table(
        "provincia",
        sa.column("codigo", sa.Text),
        sa.column("nombre", sa.Text),
        sa.column("orden", sa.Integer),
    )
    op.bulk_insert(prov_table, [
        {"codigo": c, "nombre": n, "orden": o} for c, n, o in _PROVINCIAS
    ])

    # Sectores semilla
    sector_table = sa.table(
        "sector",
        sa.column("codigo", sa.Text),
        sa.column("nombre", sa.Text),
        sa.column("orden", sa.Integer),
    )
    op.bulk_insert(sector_table, [
        {"codigo": c, "nombre": n, "orden": o} for c, n, o in _SECTORES
    ])

    # Disposiciones semilla
    disp_table = sa.table(
        "disposicion",
        sa.column("codigo", sa.Text),
        sa.column("nombre", sa.Text),
        sa.column("genera_cobro", sa.Boolean),
        sa.column("orden", sa.Integer),
    )
    op.bulk_insert(disp_table, [
        {"codigo": c, "nombre": n, "genera_cobro": g, "orden": o}
        for c, n, g, o in _DISPOSICIONES
    ])


def downgrade() -> None:
    op.drop_table("asignacion_vendedor")
    op.drop_table("disposicion")
    for tabla in ("canal", "tema", "sector", "zona"):
        op.drop_table(tabla)
    op.drop_table("localidad")
    op.drop_table("provincia")
