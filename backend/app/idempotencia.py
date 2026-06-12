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
    """Reserva (o lee) la fila de idempotencia para (clave, operacion).

    Si la fila ya existe, devuelve su respuesta_json (replay). Si no, inserta una
    reserva nueva (respuesta=None tipicamente) y devuelve `respuesta`.

    CONTRATO -- MUY IMPORTANTE:
    Esta funcion DEBE ser la PRIMERA sentencia de la operacion, ANTES de cualquier
    efecto secundario (pagos, movimientos de caja, cambios de estado). El motivo:
    si dos requests concurrentes con la misma clave compiten, el perdedor recibe un
    IntegrityError sobre la unique constraint y, para resolverlo, debe DESHACER su
    insert. Aqui ese deshacer se acota a un SAVEPOINT anidado (begin_nested), de modo
    que solo se revierte la reserva fallida y NO la transaccion completa del llamador.
    Aun asi, invocarla primero garantiza que en el momento del IntegrityError todavia
    no se haya escrito ningun efecto que pudiera quedar inconsistente.

    El patron de uso es: (1) reservar aqui con respuesta=None, (2) ejecutar los
    efectos en la MISMA transaccion, (3) rellenar respuesta_json con la respuesta real,
    (4) un unico commit. Asi un crash deja o bien nada, o bien una fila completa y
    re-ejecutable (nunca una reserva con respuesta_json=NULL commiteada sola).
    """
    existente = await session.execute(
        select(IdempotencyKey).where(
            IdempotencyKey.clave == clave, IdempotencyKey.operacion == operacion
        )
    )
    fila = existente.scalar_one_or_none()
    if fila is not None:
        return fila.respuesta_json

    nueva = IdempotencyKey(clave=clave, operacion=operacion, respuesta_json=respuesta)
    try:
        # SAVEPOINT: acota el rollback del IntegrityError a esta reserva, sin tirar
        # abajo la transaccion del llamador.
        async with session.begin_nested():
            session.add(nueva)
            await session.flush()
    except IntegrityError:
        existente = await session.execute(
            select(IdempotencyKey).where(
                IdempotencyKey.clave == clave, IdempotencyKey.operacion == operacion
            )
        )
        fila = existente.scalar_one()
        return fila.respuesta_json
    return respuesta
