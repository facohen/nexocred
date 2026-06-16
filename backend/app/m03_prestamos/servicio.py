import json
import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auditoria import escribir_evento
from app.errors import ErrorAPI
from app.idempotencia import IdempotencyKey, guardar_resultado_idempotente
from app.locking import bloquear_prestamo
from app.m03_prestamos.reconstruccion import (
    cronograma_desde_cuotas,
    imputaciones_core,
)
from app.m04_pagos import servicio as pagos
from app.m04_pagos.schemas import PagoOut
from app.modelos_stub import Cuota, Imputacion, Pago, Prestamo
from nexocred_core import ModoPago, ResultadoPayoff, calcular_payoff


async def obtener_prestamo(
    session: AsyncSession, prestamo_id: uuid.UUID
) -> Prestamo | None:
    res = await session.execute(select(Prestamo).where(Prestamo.id == prestamo_id))
    return res.scalar_one_or_none()


async def listar_prestamos(
    session: AsyncSession,
    *,
    estado: str | None = None,
    persona_id: uuid.UUID | None = None,
    producto_id: uuid.UUID | None = None,
    vendedor_id: uuid.UUID | None = None,
) -> list[Prestamo]:
    stmt = select(Prestamo).order_by(Prestamo.created_at.desc())
    if estado is not None:
        stmt = stmt.where(Prestamo.estado == estado)
    if persona_id is not None:
        stmt = stmt.where(Prestamo.persona_id == persona_id)
    if producto_id is not None:
        stmt = stmt.where(Prestamo.producto_id == producto_id)
    if vendedor_id is not None:
        stmt = stmt.where(Prestamo.vendedor_id == vendedor_id)
    res = await session.execute(stmt)
    return list(res.scalars().all())


async def cuotas_de(session: AsyncSession, prestamo_id: uuid.UUID) -> list[Cuota]:
    res = await session.execute(
        select(Cuota).where(Cuota.prestamo_id == prestamo_id).order_by(Cuota.numero)
    )
    return list(res.scalars().all())


async def _imputaciones_vigentes(
    session: AsyncSession, prestamo_id: uuid.UUID
) -> list[Imputacion]:
    res = await session.execute(
        select(Imputacion)
        .join(Pago, Imputacion.pago_id == Pago.id)
        .where(Pago.prestamo_id == prestamo_id)
    )
    return list(res.scalars().all())


async def payoff(
    session: AsyncSession, prestamo: Prestamo, fecha_negocio: date
) -> ResultadoPayoff:
    cuotas = await cuotas_de(session, prestamo.id)
    crono = cronograma_desde_cuotas(cuotas)
    imps = imputaciones_core(await _imputaciones_vigentes(session, prestamo.id))
    tasa_pun = prestamo.tasa_punitorio_diario or 0
    return calcular_payoff(crono, imps, fecha_negocio, tasa_pun)  # type: ignore[arg-type]


async def cancelar(
    session: AsyncSession,
    *,
    prestamo_id: uuid.UUID,
    caja_id: uuid.UUID,
    fecha_negocio: date,
    canal: str,
    idempotency_key: str,
    actor_id: uuid.UUID | None,
) -> PagoOut:
    operacion = "cancelar_prestamo"
    # (a) Reserva de idempotencia DENTRO de la misma transaccion que los efectos.
    previo = await guardar_resultado_idempotente(
        session, idempotency_key, operacion, None
    )
    if previo is not None:
        await session.commit()
        return PagoOut.model_validate(json.loads(previo))

    # (b) Lock FOR UPDATE sostenido de punta a punta (no se libera a mitad de la op).
    prestamo = await bloquear_prestamo(session, prestamo_id)
    if prestamo.estado not in ("vigente", "en_mora"):
        raise ErrorAPI(
            "transicion_invalida",
            f"no se puede cancelar un prestamo en estado {prestamo.estado}",
            status=409,
        )
    pago_total = await payoff(session, prestamo, fecha_negocio)

    # (c) Pago de cancelacion anticipada via nucleo NON-COMMITTING (sin idem propia,
    # sin commit): comparte transaccion y lock con esta operacion compuesta.
    out, _pago = await pagos.registrar_pago_uow(
        session,
        prestamo_id=prestamo_id,
        monto=pago_total.total,
        canal=canal,
        caja_id=caja_id,
        fecha_negocio=fecha_negocio,
        idempotency_key=None,
        modo=ModoPago.CANCELACION_ANTICIPADA,
        actor_id=actor_id,
        reservar_idem=False,
    )
    assert out is not None

    # (d) Estado del prestamo en la MISMA transaccion (mismo prestamo ya bloqueado).
    prestamo.estado = "cancelado"
    await session.flush()

    # (e) Rellena la respuesta idempotente con el resultado real antes del commit.
    await _guardar_idem(session, idempotency_key, operacion, out.model_dump_json())
    await escribir_evento(
        session, actor_id=actor_id, accion="prestamo_cancelacion", entidad="prestamo",
        entidad_id=prestamo_id, metadata_json={"total": str(pago_total.total)},
    )
    # (f) UN solo commit al final: el lock se mantuvo durante toda la operacion.
    await session.commit()
    return out


async def _guardar_idem(
    session: AsyncSession, clave: str, operacion: str, respuesta: str
) -> None:
    res = await session.execute(
        select(IdempotencyKey).where(
            IdempotencyKey.clave == clave, IdempotencyKey.operacion == operacion
        )
    )
    fila = res.scalar_one()
    fila.respuesta_json = respuesta
    await session.flush()
