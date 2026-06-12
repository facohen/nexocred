import hashlib
import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    String,
    Text,
    UniqueConstraint,
    func,
    select,
    text,
)
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


def _clave_lock(clave: str, operacion: str) -> int:
    """Mapea (clave, operacion) a un bigint determinista para el advisory lock.

    Postgres `pg_advisory_xact_lock(bigint)` toma una clave de 64 bits con signo.
    Derivamos un entero estable del par via sha256 (independiente del hash de Python,
    que no es estable entre procesos) y lo encajamos en el rango de int64 con signo.
    """
    digest = hashlib.sha256(f"{clave}\x00{operacion}".encode()).digest()
    return int.from_bytes(digest[:8], "big", signed=True)


async def guardar_resultado_idempotente(
    session: AsyncSession, clave: str, operacion: str, respuesta: str | None
) -> str | None:
    """Reserva (o lee) la fila de idempotencia para (clave, operacion).

    Si la fila ya existe, devuelve su respuesta_json (replay). Si no, inserta una
    reserva nueva (respuesta=None tipicamente) y devuelve `respuesta`.

    CONTRATO -- MUY IMPORTANTE:
    Esta funcion DEBE ser la PRIMERA sentencia de la operacion, ANTES de cualquier
    efecto secundario (pagos, movimientos de caja, cambios de estado).

    SERIALIZACION IN-FLIGHT (advisory lock):
    Lo primero que hace es tomar un `pg_advisory_xact_lock` transaccional keyed por
    (clave, operacion). Eso fuerza que dos requests concurrentes con la MISMA clave se
    serialicen: el segundo BLOQUEA aqui hasta que el primero commitea (el lock se
    libera al fin de su transaccion). Cuando el segundo se desbloquea y vuelve a leer,
    ya ve la fila del primero con `respuesta_json` rellenada -> true replay, sin
    re-ejecutar efectos. El lock es transaccional: no requiere unlock explicito y se
    libera tanto en commit como en rollback, evitando filtraciones de lock.

    El patron de uso es: (1) reservar aqui con respuesta=None (tomando el lock),
    (2) ejecutar los efectos en la MISMA transaccion, (3) rellenar respuesta_json con
    la respuesta real, (4) un unico commit (que libera el lock). Asi requests
    concurrentes con la misma (clave, operacion) producen EXACTAMENTE UN set de
    efectos secundarios e identica respuesta.
    """
    lock_key = _clave_lock(clave, operacion)
    await session.execute(
        text("SELECT pg_advisory_xact_lock(:k)").bindparams(k=lock_key)
    )

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
