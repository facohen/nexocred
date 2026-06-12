"""F1c — operaciones de campo (La Ruta), CRM, comisiones y riesgo.

Revision ID: 0003_f1c
Revises: 0002_f1b
Create Date: 2026-06-11

Extiende los stubs/tablas de F1a/F1b (NO los recrea) con las columnas que necesitan
La Ruta (rendiciones/descargos), CRM (tareas/incidentes/interacciones/asignaciones/
prospectos), comisiones (devengo/clawback/liquidaciones) y el motor de alarmas de
riesgo. Crea las tablas nuevas: rendicion, rendicion_descargo, comision_liquidacion(+
detalle), interaccion, asignacion_crm, prospecto.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0003_f1c"
down_revision: str | None = "0002_f1b"
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
    # ---------- comision_devengo deltas ----------
    op.add_column("comision_devengo", sa.Column("tipo", sa.Text()))
    op.add_column("comision_devengo", sa.Column("porcentaje", sa.Numeric(10, 4)))
    op.add_column(
        "comision_devengo",
        sa.Column(
            "clawback_de_id",
            UUID,
            sa.ForeignKey("comision_devengo.id"),
            nullable=True,
        ),
    )
    op.create_check_constraint(
        "comision_devengo_estado_check",
        "comision_devengo",
        "estado IN ('devengada','confirmada','clawback','liquidada')",
    )
    # El vendedor de un prestamo es un `usuario`, no una `persona`. Re-apuntamos la FK
    # (el stub F1a la dejaba contra persona) para que el devengo siga al vendedor del
    # prestamo de forma consistente con comision_liquidacion.vendedor_id -> usuario.
    op.drop_constraint("comision_devengo_vendedor_id_fkey", "comision_devengo")
    op.create_foreign_key(
        "comision_devengo_vendedor_id_fkey",
        "comision_devengo",
        "usuario",
        ["vendedor_id"],
        ["id"],
    )

    # ---------- tarea deltas ----------
    op.add_column("tarea", sa.Column("origen", sa.Text(), server_default="manual"))
    op.add_column(
        "tarea", sa.Column("alerta_id", UUID, sa.ForeignKey("alerta.id"))
    )
    op.add_column("tarea", sa.Column("vencimiento", sa.Date()))
    op.add_column("tarea", sa.Column("prioridad", sa.Text()))
    op.add_column("tarea", sa.Column("descripcion", sa.Text()))

    # ---------- incidente deltas ----------
    op.add_column("incidente", sa.Column("titulo", sa.Text()))
    op.add_column("incidente", sa.Column("severidad", sa.Text()))
    op.add_column(
        "incidente", sa.Column("operador_id", UUID, sa.ForeignKey("usuario.id"))
    )
    op.add_column("incidente", sa.Column("detalle", sa.Text()))

    # ---------- alerta deltas ----------
    op.add_column("alerta", sa.Column("severidad", sa.Text()))
    op.add_column("alerta", sa.Column("metrica", sa.Text()))
    op.add_column(
        "alerta", sa.Column("operador_id", UUID, sa.ForeignKey("usuario.id"))
    )
    op.add_column(
        "alerta", sa.Column("tarea_id", UUID, sa.ForeignKey("tarea.id"))
    )
    op.add_column("alerta", sa.Column("valor", sa.Numeric(14, 4)))
    op.add_column(
        "alerta", sa.Column("resuelta_en", sa.DateTime(timezone=True))
    )
    op.add_column("alerta", sa.Column("justificacion", sa.Text()))

    # ---------- rendicion ----------
    op.create_table(
        "rendicion",
        sa.Column("id", UUID, primary_key=True, server_default=UUID_PK),
        sa.Column("ruta_id", UUID, sa.ForeignKey("ruta_diaria.id"), nullable=False),
        sa.Column("cobrador_id", UUID, sa.ForeignKey("usuario.id")),
        sa.Column("fecha_negocio", sa.Date(), nullable=False),
        sa.Column("total_cobrado", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("total_descargos", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("diferencia", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("estado", sa.Text(), nullable=False, server_default="abierta"),
        _ts(),
        sa.CheckConstraint(
            "estado IN ('abierta','presentada','aprobada','observada')",
            name="rendicion_estado_check",
        ),
    )

    # ---------- rendicion_descargo ----------
    op.create_table(
        "rendicion_descargo",
        sa.Column("id", UUID, primary_key=True, server_default=UUID_PK),
        sa.Column(
            "rendicion_id", UUID, sa.ForeignKey("rendicion.id"), nullable=False
        ),
        sa.Column("concepto", sa.Text(), nullable=False),
        sa.Column("monto", sa.Numeric(14, 2), nullable=False),
        sa.Column("estado", sa.Text(), nullable=False, server_default="pendiente"),
        sa.Column("aprobado_por", UUID, sa.ForeignKey("usuario.id")),
        _ts(),
        sa.CheckConstraint(
            "estado IN ('pendiente','aprobado','rechazado')",
            name="rendicion_descargo_estado_check",
        ),
    )

    # ---------- comision_liquidacion ----------
    op.create_table(
        "comision_liquidacion",
        sa.Column("id", UUID, primary_key=True, server_default=UUID_PK),
        sa.Column("vendedor_id", UUID, sa.ForeignKey("usuario.id"), nullable=False),
        sa.Column("periodo_desde", sa.Date(), nullable=False),
        sa.Column("periodo_hasta", sa.Date(), nullable=False),
        sa.Column("monto_total", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("estado", sa.Text(), nullable=False, server_default="borrador"),
        sa.Column("aprobada_por", UUID, sa.ForeignKey("usuario.id")),
        sa.Column("aprobada_en", sa.DateTime(timezone=True)),
        sa.Column("egreso_id", UUID, sa.ForeignKey("movimiento_caja.id")),
        _ts(),
        sa.CheckConstraint(
            "estado IN ('borrador','aprobada','pagada')",
            name="comision_liquidacion_estado_check",
        ),
    )

    # ---------- comision_liquidacion_detalle ----------
    op.create_table(
        "comision_liquidacion_detalle",
        sa.Column("id", UUID, primary_key=True, server_default=UUID_PK),
        sa.Column(
            "liquidacion_id",
            UUID,
            sa.ForeignKey("comision_liquidacion.id"),
            nullable=False,
        ),
        sa.Column(
            "comision_devengo_id",
            UUID,
            sa.ForeignKey("comision_devengo.id"),
            nullable=False,
        ),
        sa.Column("monto", sa.Numeric(14, 2), nullable=False),
    )

    # ---------- interaccion ----------
    op.create_table(
        "interaccion",
        sa.Column("id", UUID, primary_key=True, server_default=UUID_PK),
        sa.Column("persona_id", UUID, sa.ForeignKey("persona.id")),
        sa.Column("operador_id", UUID, sa.ForeignKey("usuario.id")),
        sa.Column("tipo", sa.Text()),
        sa.Column("tarea_id", UUID, sa.ForeignKey("tarea.id")),
        sa.Column("detalle", sa.Text()),
        sa.Column(
            "fecha", sa.DateTime(timezone=True), server_default=sa.text("now()")
        ),
        _ts(),
        sa.CheckConstraint(
            "tipo IS NULL OR tipo IN ('llamada','visita','mensaje','nota')",
            name="interaccion_tipo_check",
        ),
    )

    # ---------- asignacion_crm ----------
    op.create_table(
        "asignacion_crm",
        sa.Column("id", UUID, primary_key=True, server_default=UUID_PK),
        sa.Column("persona_id", UUID, sa.ForeignKey("persona.id"), nullable=False),
        sa.Column("operador_id", UUID, sa.ForeignKey("usuario.id"), nullable=False),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default="true"),
        _ts(),
    )

    # ---------- prospecto ----------
    op.create_table(
        "prospecto",
        sa.Column("id", UUID, primary_key=True, server_default=UUID_PK),
        sa.Column("nombre", sa.Text()),
        sa.Column("telefono", sa.Text()),
        sa.Column("estado", sa.Text(), nullable=False, server_default="nuevo"),
        sa.Column("persona_id", UUID, sa.ForeignKey("persona.id")),
        sa.Column("operador_id", UUID, sa.ForeignKey("usuario.id")),
        _ts(),
        sa.CheckConstraint(
            "estado IN ('nuevo','contactado','calificado','convertido','descartado')",
            name="prospecto_estado_check",
        ),
    )


def downgrade() -> None:
    op.drop_table("prospecto")
    op.drop_table("asignacion_crm")
    op.drop_table("interaccion")
    op.drop_table("comision_liquidacion_detalle")
    op.drop_table("comision_liquidacion")
    op.drop_table("rendicion_descargo")
    op.drop_table("rendicion")
    for col in ("justificacion", "resuelta_en", "valor", "tarea_id",
                "operador_id", "metrica", "severidad"):
        op.drop_column("alerta", col)
    for col in ("detalle", "operador_id", "severidad", "titulo"):
        op.drop_column("incidente", col)
    for col in ("descripcion", "prioridad", "vencimiento", "alerta_id", "origen"):
        op.drop_column("tarea", col)
    op.drop_constraint("comision_devengo_vendedor_id_fkey", "comision_devengo")
    op.create_foreign_key(
        "comision_devengo_vendedor_id_fkey",
        "comision_devengo",
        "persona",
        ["vendedor_id"],
        ["id"],
    )
    op.drop_constraint("comision_devengo_estado_check", "comision_devengo")
    for col in ("clawback_de_id", "porcentaje", "tipo"):
        op.drop_column("comision_devengo", col)
