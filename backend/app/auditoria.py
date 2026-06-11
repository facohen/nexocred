import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from app.modelos_base import Base, uuid_pk


class AuditoriaEvento(Base):
    __tablename__ = "auditoria_evento"

    id: Mapped[uuid.UUID] = uuid_pk()
    actor_id: Mapped[uuid.UUID | None] = mapped_column()
    accion: Mapped[str] = mapped_column(String(100), nullable=False)
    entidad: Mapped[str] = mapped_column(String(100), nullable=False)
    entidad_id: Mapped[str | None] = mapped_column(String(64))
    resultado: Mapped[str] = mapped_column(String(20), nullable=False)
    ip: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(Text)
    metadata_json: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


async def escribir_evento(
    session: AsyncSession,
    *,
    actor_id: uuid.UUID | None,
    accion: str,
    entidad: str,
    entidad_id: object = None,
    resultado: str = "ok",
    ip: str | None = None,
    user_agent: str | None = None,
    metadata_json: dict | None = None,
) -> None:
    session.add(
        AuditoriaEvento(
            actor_id=actor_id,
            accion=accion,
            entidad=entidad,
            entidad_id=str(entidad_id) if entidad_id is not None else None,
            resultado=resultado,
            ip=ip,
            user_agent=user_agent,
            metadata_json=metadata_json,
        )
    )
