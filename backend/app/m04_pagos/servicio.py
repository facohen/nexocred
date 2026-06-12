import json
import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auditoria import escribir_evento
from app.errors import ErrorAPI
from app.idempotencia import IdempotencyKey, guardar_resultado_idempotente
from app.locking import bloquear_caja, bloquear_prestamo
from app.m03_prestamos.reconstruccion import (
    cronograma_desde_cuotas,
    imputaciones_core,
)
from app.m04_caja.servicio import registrar_movimiento
from app.m04_pagos.schemas import PagoOut
from app.modelos_stub import Cuota, Imputacion, Pago, Prestamo
from nexocred_core import (
    ConceptoImputacion,
    EntradaPago,
    ModoPago,
    ResultadoPago,
    aplicar_pago,
    aplicar_tolerancia,
    calcular_saldo_exigible,
    sumar,
)


def _tolerancia_param() -> Decimal:
    from app.m12_auth.router import PARAMETROS_GLOBALES

    return Decimal(str(PARAMETROS_GLOBALES.get("tolerancia_cobro", "0")))


async def _cuotas_de(session: AsyncSession, prestamo_id: uuid.UUID) -> list[Cuota]:
    res = await session.execute(
        select(Cuota).where(Cuota.prestamo_id == prestamo_id).order_by(Cuota.numero)
    )
    return list(res.scalars().all())


async def _imputaciones_previas(
    session: AsyncSession, prestamo_id: uuid.UUID
) -> list[Imputacion]:
    res = await session.execute(
        select(Imputacion)
        .join(Pago, Imputacion.pago_id == Pago.id)
        .where(Pago.prestamo_id == prestamo_id)
    )
    return list(res.scalars().all())


def _cuota_id_por_numero(cuotas: list[Cuota]) -> dict[int, uuid.UUID]:
    return {c.numero: c.id for c in cuotas}


async def _persistir_resultado(
    session: AsyncSession,
    *,
    prestamo: Prestamo,
    resultado: ResultadoPago,
    canal: str | None,
    fecha_negocio: date,
    caja_id: uuid.UUID,
    idempotency_key: str | None,
    corrige_pago_id: uuid.UUID | None,
    cuotas: list[Cuota],
) -> Pago:
    pago = Pago(
        prestamo_id=prestamo.id,
        monto=resultado.entrada.monto,
        excedente=resultado.excedente,
        estado="aplicado",
        canal=canal,
        fecha_negocio=fecha_negocio,
        idempotency_key=idempotency_key,
        corrige_pago_id=corrige_pago_id,
    )
    session.add(pago)
    await session.flush()

    por_numero = _cuota_id_por_numero(cuotas)
    for imp in resultado.imputaciones:
        session.add(
            Imputacion(
                pago_id=pago.id,
                cuota_id=por_numero.get(imp.cuota_numero) if imp.cuota_numero else None,
                concepto=imp.concepto.value,
                monto=imp.monto,
                orden_waterfall=imp.orden_waterfall,
                cuota_numero=imp.cuota_numero,
            )
        )
    await session.flush()

    # Movimiento de caja ingreso == monto del pago, vinculado al pago.
    caja = await bloquear_caja(session, caja_id)
    mov = await registrar_movimiento(
        session, caja, tipo="ingreso", monto=resultado.entrada.monto,
        fecha_negocio=fecha_negocio, concepto="cobro de pago", categoria="cobranza",
        pago_id=pago.id,
    )
    pago.caja_id = mov.id
    await session.flush()
    return pago


async def _actualizar_estados_cuotas(
    session: AsyncSession,
    prestamo: Prestamo,
    cuotas: list[Cuota],
    fecha_negocio: date,
) -> None:
    """Recalcula estado de cada cuota a partir del saldo exigible reconstruido del core
    + tolerancia de cobro (§7.1 caso 8)."""
    imps = imputaciones_core(await _imputaciones_previas(session, prestamo.id))
    crono = cronograma_desde_cuotas(cuotas)
    tasa_pun = prestamo.tasa_punitorio_diario or Decimal("0")
    saldo = calcular_saldo_exigible(crono, imps, fecha_negocio, tasa_pun)
    exigible_por_cuota = {c.numero: c.total_exigible for c in saldo.cuotas}
    tolerancia = _tolerancia_param()

    for cuota in cuotas:
        # ¿se imputó algo a esta cuota?
        imputado = sumar(
            *[i.monto for i in imps if i.cuota_numero == cuota.numero]
        ) if any(i.cuota_numero == cuota.numero for i in imps) else Decimal("0")
        restante = exigible_por_cuota.get(cuota.numero)

        if restante is None:
            # cuota no vencida: pendiente salvo que ya este pagada
            if cuota.estado not in ("pagada", "tolerada"):
                cuota.estado = "pendiente"
            continue

        if restante == Decimal("0"):
            cuota.estado = "pagada"
        elif imputado > Decimal("0"):
            # tolerancia: si el faltante esta dentro de la tolerancia, cerrar como tolerada
            res_tol = aplicar_tolerancia(
                cuota_exigible=restante + imputado,
                monto_pagado=imputado,
                tolerancia=tolerancia,
            )
            if res_tol.dentro_de_tolerancia and restante <= tolerancia:
                cuota.estado = "tolerada"
            else:
                cuota.estado = "parcial"
        else:
            if cuota.estado not in ("pagada", "tolerada"):
                cuota.estado = "pendiente"
    await session.flush()


async def registrar_pago(
    session: AsyncSession,
    *,
    prestamo_id: uuid.UUID,
    monto: Decimal,
    canal: str,
    caja_id: uuid.UUID,
    fecha_negocio: date,
    idempotency_key: str,
    modo: ModoPago = ModoPago.NORMAL,
    actor_id: uuid.UUID | None,
) -> PagoOut:
    operacion = "registrar_pago"
    previo = await guardar_resultado_idempotente(
        session, idempotency_key, operacion, None
    )
    if previo is not None:
        await session.commit()
        return PagoOut.model_validate(json.loads(previo))

    if monto <= Decimal("0"):
        raise ErrorAPI("monto_invalido", "el monto debe ser positivo", status=422)

    prestamo = await bloquear_prestamo(session, prestamo_id)
    if prestamo.snapshot_terminos is None:
        raise ErrorAPI(
            "prestamo_sin_snapshot", "el prestamo no esta desembolsado", status=409
        )

    cuotas = await _cuotas_de(session, prestamo_id)
    imps_previas = imputaciones_core(await _imputaciones_previas(session, prestamo_id))
    crono = cronograma_desde_cuotas(cuotas)
    tasa_pun = prestamo.tasa_punitorio_diario or Decimal("0")
    saldo = calcular_saldo_exigible(crono, imps_previas, fecha_negocio, tasa_pun)

    entrada = EntradaPago(monto=monto, fecha_negocio=fecha_negocio, modo=modo)
    resultado = aplicar_pago(saldo, entrada)

    pago = await _persistir_resultado(
        session, prestamo=prestamo, resultado=resultado, canal=canal,
        fecha_negocio=fecha_negocio, caja_id=caja_id,
        idempotency_key=idempotency_key, corrige_pago_id=None, cuotas=cuotas,
    )
    await _actualizar_estados_cuotas(session, prestamo, cuotas, fecha_negocio)

    out = PagoOut.model_validate(pago)
    await _guardar_idem(session, idempotency_key, operacion, out)
    await escribir_evento(
        session, actor_id=actor_id, accion="pago_registro", entidad="pago",
        entidad_id=pago.id, metadata_json={"monto": str(monto), "prestamo_id": str(prestamo_id)},
    )
    await session.commit()
    return out


async def _guardar_idem(
    session: AsyncSession, clave: str, operacion: str, out: PagoOut
) -> None:
    res = await session.execute(
        select(IdempotencyKey).where(
            IdempotencyKey.clave == clave, IdempotencyKey.operacion == operacion
        )
    )
    fila = res.scalar_one()
    fila.respuesta_json = out.model_dump_json()
    await session.flush()


async def obtener_pago(session: AsyncSession, pago_id: uuid.UUID) -> Pago | None:
    res = await session.execute(select(Pago).where(Pago.id == pago_id))
    return res.scalar_one_or_none()


async def imputaciones_de_pago(
    session: AsyncSession, pago_id: uuid.UUID
) -> list[Imputacion]:
    res = await session.execute(
        select(Imputacion)
        .where(Imputacion.pago_id == pago_id)
        .order_by(Imputacion.orden_waterfall)
    )
    return list(res.scalars().all())


async def pagos_de_prestamo(
    session: AsyncSession, prestamo_id: uuid.UUID
) -> list[Pago]:
    res = await session.execute(
        select(Pago).where(Pago.prestamo_id == prestamo_id).order_by(Pago.created_at)
    )
    return list(res.scalars().all())


async def pagos_a_aplicar(session: AsyncSession) -> list[Pago]:
    res = await session.execute(
        select(Pago).where(Pago.estado == "a_aplicar").order_by(Pago.created_at)
    )
    return list(res.scalars().all())


# Reexport para Task 8/Task 6
__all__ = [
    "ConceptoImputacion",
    "registrar_pago",
    "obtener_pago",
    "imputaciones_de_pago",
    "pagos_de_prestamo",
    "pagos_a_aplicar",
]
