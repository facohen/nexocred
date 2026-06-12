"""Helpers de lock de fila (SELECT ... FOR UPDATE) para operaciones que mueven dinero.

Toda operacion que cambia saldos (desembolso, pago, correccion, cancelacion,
transferencia, novacion) debe correr en una transaccion con lock de las filas
afectadas del prestamo/caja (spec §5.7).
"""

import uuid

from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ErrorAPI
from app.m04_caja.modelos import Caja
from app.modelos_stub import Prestamo, SolicitudCredito


def _stmt_prestamo_for_update(prestamo_id: uuid.UUID | str) -> Select:
    return select(Prestamo).where(Prestamo.id == prestamo_id).with_for_update()


def _stmt_caja_for_update(caja_id: uuid.UUID | str) -> Select:
    return select(Caja).where(Caja.id == caja_id).with_for_update()


async def bloquear_prestamo(session: AsyncSession, prestamo_id: uuid.UUID) -> Prestamo:
    res = await session.execute(_stmt_prestamo_for_update(prestamo_id))
    prestamo = res.scalar_one_or_none()
    if prestamo is None:
        raise ErrorAPI("prestamo_no_encontrado", "prestamo inexistente", status=404)
    return prestamo


async def bloquear_caja(session: AsyncSession, caja_id: uuid.UUID) -> Caja:
    res = await session.execute(_stmt_caja_for_update(caja_id))
    caja = res.scalar_one_or_none()
    if caja is None:
        raise ErrorAPI("caja_no_encontrada", "caja inexistente", status=404)
    return caja


async def bloquear_solicitud(session: AsyncSession, solicitud_id: uuid.UUID) -> SolicitudCredito:
    res = await session.execute(
        select(SolicitudCredito)
        .where(SolicitudCredito.id == solicitud_id)
        .with_for_update()
    )
    sol = res.scalar_one_or_none()
    if sol is None:
        raise ErrorAPI("solicitud_no_encontrada", "solicitud inexistente", status=404)
    return sol
