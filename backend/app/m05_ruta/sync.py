"""Sync offline idempotente de La Ruta.

El UUIDv7 generado en el dispositivo es la PRIMARY KEY de `parada_ruta` (y de `pago`),
de modo que un batch reenviado es idempotente por upsert: `INSERT ... ON CONFLICT (id)
DO NOTHING`. Si la parada se inserto recien y trae un cobro, se aplica el pago via
`registrar_pago_uow` usando el `pago_id` del dispositivo como PK del pago (idempotente
por PK tambien). Un solo commit por sync; se bloquea cada prestamo afectado.
"""

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.auditoria import escribir_evento
from app.errors import ErrorAPI
from app.locking import bloquear_prestamo
from app.m04_pagos.servicio import registrar_pago_uow
from app.m05_ruta.schemas import ParadaSyncIn, SyncItemOut, SyncOut
from app.modelos_stub import Pago, ParadaRuta, RutaDiaria

RESULTADOS_CON_PAGO = {"pago", "parcial"}


async def _existe_pago(session: AsyncSession, pago_id: uuid.UUID) -> bool:
    res = await session.execute(select(Pago.id).where(Pago.id == pago_id))
    return res.scalar_one_or_none() is not None


async def sincronizar(
    session: AsyncSession,
    *,
    ruta: RutaDiaria,
    paradas: list[ParadaSyncIn],
    caja_id: uuid.UUID | None,
    actor_id: uuid.UUID | None,
) -> SyncOut:
    items: list[SyncItemOut] = []
    aplicadas = 0
    omitidas = 0

    for p in paradas:
        # Upsert idempotente por PK del dispositivo: si ya existia, no se reaplica.
        stmt = (
            pg_insert(ParadaRuta)
            .values(
                id=p.id,
                ruta_id=ruta.id,
                prestamo_id=p.prestamo_id,
                orden=p.orden,
                resultado=p.resultado,
                monto_cobrado=p.monto_cobrado,
                foto_url=p.foto_url,
                lat=Decimal(p.lat) if p.lat is not None else None,
                lng=Decimal(p.lng) if p.lng is not None else None,
                notas=p.notas,
                visitada_en=p.visitada_en,
            )
            .on_conflict_do_nothing(index_elements=["id"])
            .returning(ParadaRuta.id)
        )
        res = await session.execute(stmt)
        inserto = res.scalar_one_or_none() is not None

        pago_id: uuid.UUID | None = None
        if not inserto:
            omitidas += 1
            items.append(SyncItemOut(parada_id=p.id, estado="omitida"))
            continue

        aplicadas += 1
        # Aplicar pago si corresponde y aun no existe (idempotente por PK del pago).
        if (
            p.resultado in RESULTADOS_CON_PAGO
            and p.monto_cobrado is not None
            and p.monto_cobrado > Decimal("0")
            and p.pago_id is not None
        ):
            if caja_id is None:
                raise ErrorAPI(
                    "caja_requerida",
                    "se requiere caja_id para aplicar cobros en el sync",
                    status=422,
                )
            if not await _existe_pago(session, p.pago_id):
                fneg = (
                    p.visitada_en.date()
                    if p.visitada_en is not None
                    else (ruta.fecha or date.today())
                )
                await bloquear_prestamo(session, p.prestamo_id)
                _out, pago = await registrar_pago_uow(
                    session,
                    prestamo_id=p.prestamo_id,
                    monto=p.monto_cobrado,
                    canal="ruta",
                    caja_id=caja_id,
                    fecha_negocio=fneg,
                    idempotency_key=None,
                    actor_id=actor_id,
                    pago_id=p.pago_id,
                )
                if pago is not None:
                    pago.parada_id = p.id
                    pago_id = pago.id
            else:
                pago_id = p.pago_id
        items.append(
            SyncItemOut(parada_id=p.id, estado="aplicada", pago_id=pago_id)
        )

    await session.flush()
    await escribir_evento(
        session, actor_id=actor_id, accion="ruta_sync", entidad="ruta_diaria",
        entidad_id=ruta.id,
        metadata_json={"aplicadas": aplicadas, "omitidas": omitidas},
    )
    await session.commit()
    return SyncOut(
        ruta_id=ruta.id, items=items, aplicadas=aplicadas, omitidas=omitidas
    )
