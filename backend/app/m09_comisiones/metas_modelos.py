import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.modelos_base import Base, uuid_pk


class MetaVendedor(Base):
    """Meta de colocación de un vendedor para un período mensual (YYYY-MM).

    Módulo aditivo: no toca nada existente. El *avance* (monto realmente colocado)
    NO se persiste acá — se calcula al vuelo desde los préstamos desembolsados del
    período (ver servicio_metas), para que la meta no quede desincronizada del dato
    financiero real.
    """

    __tablename__ = "meta_vendedor"

    id: Mapped[uuid.UUID] = uuid_pk()
    vendedor_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("usuario.id"), nullable=False
    )
    # Período mensual normalizado como 'YYYY-MM' (texto, comparación lexicográfica
    # == cronológica). Evita ambigüedad de zona horaria de un Date.
    periodo: Mapped[str] = mapped_column(Text, nullable=False)
    monto_meta: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    cantidad_meta: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint(
            "vendedor_id", "periodo", name="meta_vendedor_vendedor_periodo_uq"
        ),
        CheckConstraint("monto_meta >= 0", name="meta_vendedor_monto_no_negativo"),
        CheckConstraint(
            "periodo ~ '^[0-9]{4}-[0-9]{2}$'", name="meta_vendedor_periodo_formato"
        ),
    )
