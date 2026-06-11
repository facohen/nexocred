import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, Text, UniqueConstraint, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from app.modelos_base import Base, uuid_pk


class IdempotencyKey(Base):
    __tablename__ = "idempotency_key"

    id: Mapped[uuid.UUID] = uuid_pk()
    clave: Mapped[str] = mapped_column(String(255), nullable=False)
    operacion: Mapped[str] = mapped_column(String(100), nullable=False)
    respuesta_json: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("clave", "operacion", name="idempotency_clave_op_uq"),
    )


async def guardar_resultado_idempotente(
    session: AsyncSession, clave: str, operacion: str, respuesta: str | None
) -> str | None:
    """Inserta el resultado de una operacion idempotente. Si la (clave, operacion)
    ya existe, devuelve la respuesta previamente almacenada sin duplicar la fila."""
    existente = await session.execute(
        select(IdempotencyKey).where(
            IdempotencyKey.clave == clave, IdempotencyKey.operacion == operacion
        )
    )
    fila = existente.scalar_one_or_none()
    if fila is not None:
        return fila.respuesta_json

    nueva = IdempotencyKey(clave=clave, operacion=operacion, respuesta_json=respuesta)
    session.add(nueva)
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        existente = await session.execute(
            select(IdempotencyKey).where(
                IdempotencyKey.clave == clave, IdempotencyKey.operacion == operacion
            )
        )
        fila = existente.scalar_one()
        return fila.respuesta_json
    return respuesta
