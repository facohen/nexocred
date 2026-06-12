"""Sync offline idempotente de La Ruta.

Modelo de identidad y contrato de idempotencia
----------------------------------------------
- El UUIDv7 generado en el dispositivo es la PRIMARY KEY de `parada_ruta`; el
  `pago_id` del dispositivo es la PK del `pago`. Son identidades DESACOPLADAS: la
  reaplicacion de un cobro se decide por la identidad del PAGO, no por si la parada
  se inserto recien.

- Replay verdadero: si ya existe un `pago` con el `pago_id` del item, el cobro NO se
  reaplica (idempotente por PK del pago). Una parada cuyo payload no cambio tampoco
  genera escrituras nuevas.

- Visita CORREGIDA (misma parada UUID, payload distinto): se hace upsert
  `ON CONFLICT (id) DO UPDATE` para actualizar resultado/monto/foto/geo, y si la
  correccion trae un cobro con un `pago_id` NUEVO ese cobro SI se aplica. Asi una
  parada que primero fue 'ausente' y luego se corrige a 'pago' cobra el dinero
  (antes se perdia silenciosamente).

- Un PAGO es append-only / inmutable: si una correccion reusa el MISMO `pago_id`
  con un `monto` distinto se rechaza con 409 'pago_inmutable'. Una correccion que
  cobra debe traer un `pago_id` nuevo (lo genera el dispositivo).

- Caso inconsistente: resultado in ('pago','parcial') con monto_cobrado>0 pero
  `pago_id` None -> el item se rechaza ('rechazada') y NO se registra dinero ni se
  graba monto en la parada (no hay plata sin pago).

- Validacion por item: el `resultado` se valida contra el mismo RESULTADOS_VALIDOS de
  m05.servicio.visitar ANTES del flush, devolviendo 'rechazada' por item en vez de
  abortar todo el batch en el DB flush.

Un solo commit por sync; se bloquea cada prestamo afectado (FOR UPDATE) en orden
deterministico por prestamo_id para evitar deadlocks entre syncs concurrentes.
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
from app.m05_ruta.servicio import RESULTADOS_CON_PAGO, RESULTADOS_VALIDOS
from app.modelos_stub import Pago, ParadaRuta, RutaDiaria


async def _pago_existente(
    session: AsyncSession, pago_id: uuid.UUID
) -> Pago | None:
    res = await session.execute(select(Pago).where(Pago.id == pago_id))
    return res.scalar_one_or_none()


def _trae_cobro(p: ParadaSyncIn) -> bool:
    return (
        p.resultado in RESULTADOS_CON_PAGO
        and p.monto_cobrado is not None
        and p.monto_cobrado > Decimal("0")
    )


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
    rechazadas = 0

    # Lock determinista: bloquear los prestamos con cobro en orden por prestamo_id
    # para que dos syncs concurrentes no se interbloqueen al tomar locks de prestamos
    # solapados en ordenes opuestos.
    prestamos_a_bloquear = sorted(
        {p.prestamo_id for p in paradas if _trae_cobro(p) and p.pago_id is not None}
    )
    for prestamo_id in prestamos_a_bloquear:
        await bloquear_prestamo(session, prestamo_id)

    for p in paradas:
        # 1) Validacion de resultado por item (no aborta el batch entero).
        if p.resultado is not None and p.resultado not in RESULTADOS_VALIDOS:
            rechazadas += 1
            items.append(SyncItemOut(parada_id=p.id, estado="rechazada"))
            continue

        # 2) Caso inconsistente: cobra pero no trae pago_id -> rechazar (sin plata).
        if _trae_cobro(p) and p.pago_id is None:
            rechazadas += 1
            items.append(SyncItemOut(parada_id=p.id, estado="rechazada"))
            continue

        # 3) Pago inmutable: si reusa un pago_id existente con monto distinto -> 409.
        pago_previo: Pago | None = None
        if p.pago_id is not None:
            pago_previo = await _pago_existente(session, p.pago_id)
            if (
                pago_previo is not None
                and _trae_cobro(p)
                and pago_previo.monto != p.monto_cobrado
            ):
                raise ErrorAPI(
                    "pago_inmutable",
                    "un pago es append-only: una correccion debe traer un pago_id "
                    "nuevo, no reusar el existente con otro monto",
                    status=409,
                )

        # 4) Upsert de la parada (idempotente por PK; corrige el payload si cambio).
        lat = Decimal(p.lat) if p.lat is not None else None
        lng = Decimal(p.lng) if p.lng is not None else None
        valores = dict(
            id=p.id,
            ruta_id=ruta.id,
            prestamo_id=p.prestamo_id,
            orden=p.orden,
            resultado=p.resultado,
            monto_cobrado=p.monto_cobrado,
            foto_url=p.foto_url,
            lat=lat,
            lng=lng,
            notas=p.notas,
            visitada_en=p.visitada_en,
        )
        stmt = pg_insert(ParadaRuta).values(**valores)
        actualizables = {
            "resultado": stmt.excluded.resultado,
            "monto_cobrado": stmt.excluded.monto_cobrado,
            "foto_url": stmt.excluded.foto_url,
            "lat": stmt.excluded.lat,
            "lng": stmt.excluded.lng,
            "notas": stmt.excluded.notas,
            "visitada_en": stmt.excluded.visitada_en,
        }
        stmt = stmt.on_conflict_do_update(
            index_elements=["id"], set_=actualizables
        ).returning(ParadaRuta.id, ParadaRuta.created_at)
        res = await session.execute(stmt)
        row = res.one()
        # created_at solo existe en la fila tras inserto; en update conserva el viejo.
        # No usamos eso para decidir el pago: el pago se decide por su propia identidad.

        # 5) Aplicar el cobro segun la identidad del PAGO.
        pago_id: uuid.UUID | None = None
        if p.pago_id is not None and _trae_cobro(p):
            if pago_previo is not None:
                # Replay verdadero del cobro: no se reaplica.
                pago_id = p.pago_id
                omitidas += 1
                items.append(
                    SyncItemOut(parada_id=p.id, estado="omitida", pago_id=pago_id)
                )
                continue
            if caja_id is None:
                raise ErrorAPI(
                    "caja_requerida",
                    "se requiere caja_id para aplicar cobros en el sync",
                    status=422,
                )
            fneg = (
                p.visitada_en.date()
                if p.visitada_en is not None
                else (ruta.fecha or date.today())
            )
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
            aplicadas += 1
            items.append(
                SyncItemOut(parada_id=p.id, estado="aplicada", pago_id=pago_id)
            )
            continue

        # 6) Sin cobro: la parada (nueva o corregida) queda aplicada.
        aplicadas += 1
        items.append(SyncItemOut(parada_id=p.id, estado="aplicada"))

    await session.flush()
    await escribir_evento(
        session, actor_id=actor_id, accion="ruta_sync", entidad="ruta_diaria",
        entidad_id=ruta.id,
        metadata_json={
            "aplicadas": aplicadas, "omitidas": omitidas, "rechazadas": rechazadas
        },
    )
    await session.commit()
    return SyncOut(
        ruta_id=ruta.id, items=items, aplicadas=aplicadas, omitidas=omitidas,
        rechazadas=rechazadas,
    )
