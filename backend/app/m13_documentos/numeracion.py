"""Numeracion transaccional por tipo de documento.

`asignar_numero` bloquea (o inserta) la fila contador del `tipo` en `documento_numero`
con SELECT ... FOR UPDATE, incrementa `ultimo` y devuelve el nuevo correlativo, todo
dentro de la transaccion del llamador. Garantiza secuencia sin huecos ni duplicados
incluso bajo concurrencia (el segundo writer espera el lock del primero).
"""

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.m10_tesoreria.modelos import DocumentoNumero


async def asignar_numero(session: AsyncSession, tipo: str) -> int:
    # Asegura que la fila contador exista (no-op si ya esta), sin pisar el valor.
    await session.execute(
        pg_insert(DocumentoNumero)
        .values(tipo=tipo, ultimo=0)
        .on_conflict_do_nothing(index_elements=["tipo"])
    )
    # Bloquea la fila del tipo para serializar la asignacion del correlativo.
    res = await session.execute(
        select(DocumentoNumero).where(DocumentoNumero.tipo == tipo).with_for_update()
    )
    fila = res.scalar_one()
    fila.ultimo = fila.ultimo + 1
    await session.flush()
    return fila.ultimo
