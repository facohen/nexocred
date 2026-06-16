import json
import uuid
from datetime import UTC, date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auditoria import escribir_evento
from app.errors import ErrorAPI
from app.idempotencia import IdempotencyKey, guardar_resultado_idempotente
from app.locking import bloquear_caja, bloquear_liquidacion
from app.m04_caja.servicio import registrar_movimiento
from app.m09_comisiones.modelos import (
    ComisionLiquidacion,
    ComisionLiquidacionDetalle,
)
from app.m15_catalogo.modelos import MatrizComision
from app.modelos_stub import ComisionDevengo, Prestamo, SolicitudCredito
from nexocred_core import CERO, redondear, sumar


async def _porcentaje_comision(
    session: AsyncSession, *, producto_id: uuid.UUID, perfil_id: uuid.UUID | None
) -> Decimal | None:
    if perfil_id is None:
        return None
    res = await session.execute(
        select(MatrizComision.comision).where(
            MatrizComision.producto_id == producto_id,
            MatrizComision.perfil_id == perfil_id,
        )
    )
    return res.scalar_one_or_none()


async def devengar_por_desembolso(
    session: AsyncSession,
    *,
    prestamo: Prestamo,
    solicitud: SolicitudCredito | None,
    fecha_negocio: date,
    actor_id: uuid.UUID | None,
) -> ComisionDevengo | None:
    """Devenga la comision del vendedor al desembolsar (NON-COMMITTING).

    Resuelve el porcentaje de la matriz producto x perfil y lo aplica sobre el capital.
    No recalcula dinero con float: usa Decimal del core. Si no hay vendedor o no hay
    porcentaje en la matriz, no devenga.
    """
    if prestamo.vendedor_id is None:
        return None
    perfil_id = solicitud.perfil_pricing_id if solicitud is not None else None
    porcentaje = await _porcentaje_comision(
        session, producto_id=prestamo.producto_id, perfil_id=perfil_id
    )
    if porcentaje is None:
        return None
    capital = prestamo.capital or CERO
    monto = redondear(capital * porcentaje)
    devengo = ComisionDevengo(
        prestamo_id=prestamo.id,
        vendedor_id=prestamo.vendedor_id,
        monto=monto,
        estado="devengada",
        tipo="originacion",
        porcentaje=porcentaje,
        fecha_negocio=fecha_negocio,
    )
    session.add(devengo)
    await session.flush()
    await escribir_evento(
        session, actor_id=actor_id, accion="comision_devengo", entidad="comision_devengo",
        entidad_id=devengo.id,
        metadata_json={"prestamo_id": str(prestamo.id), "monto": str(monto)},
    )
    return devengo


async def comisiones_de_prestamo(
    session: AsyncSession, prestamo_id: uuid.UUID
) -> list[ComisionDevengo]:
    res = await session.execute(
        select(ComisionDevengo)
        .where(ComisionDevengo.prestamo_id == prestamo_id)
        .order_by(ComisionDevengo.created_at)
    )
    return list(res.scalars().all())


async def comisiones_de_vendedor(
    session: AsyncSession,
    vendedor_id: uuid.UUID,
    *,
    estado: str | None = None,
) -> list[ComisionDevengo]:
    stmt = select(ComisionDevengo).where(ComisionDevengo.vendedor_id == vendedor_id)
    if estado is not None:
        stmt = stmt.where(ComisionDevengo.estado == estado)
    stmt = stmt.order_by(ComisionDevengo.created_at.desc())
    res = await session.execute(stmt)
    return list(res.scalars().all())


async def clawback(
    session: AsyncSession,
    *,
    prestamo_id: uuid.UUID,
    motivo: str | None,
    actor_id: uuid.UUID | None,
) -> ComisionDevengo:
    """Crea un devengo negativo (estado clawback) que revierte la comision de
    originacion del prestamo (p.ej. cancelacion temprana)."""
    devengos = await comisiones_de_prestamo(session, prestamo_id)
    origen = next(
        (d for d in devengos if d.estado in ("devengada", "confirmada")
         and d.tipo == "originacion"),
        None,
    )
    if origen is None:
        raise ErrorAPI(
            "sin_comision_para_clawback",
            "no hay comision de originacion vigente para revertir",
            status=409,
        )
    reverso = ComisionDevengo(
        prestamo_id=prestamo_id,
        vendedor_id=origen.vendedor_id,
        monto=-(origen.monto or CERO),
        estado="clawback",
        tipo="clawback",
        porcentaje=origen.porcentaje,
        clawback_de_id=origen.id,
    )
    session.add(reverso)
    origen.estado = "clawback"
    await session.flush()
    await escribir_evento(
        session, actor_id=actor_id, accion="comision_clawback", entidad="comision_devengo",
        entidad_id=reverso.id,
        metadata_json={"clawback_de": str(origen.id), "motivo": motivo},
    )
    await session.commit()
    return reverso


# ---------- Liquidaciones ----------
async def generar_liquidacion(
    session: AsyncSession,
    *,
    vendedor_id: uuid.UUID,
    periodo_desde: date,
    periodo_hasta: date,
    actor_id: uuid.UUID | None,
) -> ComisionLiquidacion:
    """Suma los devengos liquidables (devengada/confirmada) del vendedor en el periodo
    en un borrador con sus detalles."""
    ya_incluidos = (
        select(ComisionLiquidacionDetalle.comision_devengo_id)
        .join(
            ComisionLiquidacion,
            ComisionLiquidacionDetalle.liquidacion_id == ComisionLiquidacion.id,
        )
        .where(ComisionLiquidacion.estado.in_(["borrador", "aprobada"]))
        .scalar_subquery()
    )
    res = await session.execute(
        select(ComisionDevengo).where(
            ComisionDevengo.vendedor_id == vendedor_id,
            ComisionDevengo.estado.in_(["devengada", "confirmada"]),
            ComisionDevengo.id.not_in(ya_incluidos),
        )
    )
    devengos = list(res.scalars().all())

    def _fecha(d: ComisionDevengo) -> date | None:
        # Periodo por fecha de negocio (= fecha de negocio del desembolso). Fallback a
        # created_at para devengos historicos previos a la columna.
        if d.fecha_negocio is not None:
            return d.fecha_negocio
        return d.created_at.date() if d.created_at is not None else None

    elegibles = [
        d for d in devengos
        if (f := _fecha(d)) is not None and periodo_desde <= f <= periodo_hasta
    ]
    montos = [d.monto or CERO for d in elegibles]
    total = redondear(sumar(*montos)) if montos else CERO

    liquidacion = ComisionLiquidacion(
        vendedor_id=vendedor_id,
        periodo_desde=periodo_desde,
        periodo_hasta=periodo_hasta,
        monto_total=total,
        estado="borrador",
    )
    session.add(liquidacion)
    await session.flush()
    for d in elegibles:
        session.add(
            ComisionLiquidacionDetalle(
                liquidacion_id=liquidacion.id,
                comision_devengo_id=d.id,
                monto=d.monto or CERO,
            )
        )
    await session.flush()
    await escribir_evento(
        session, actor_id=actor_id, accion="comision_liquidacion_generar",
        entidad="comision_liquidacion", entidad_id=liquidacion.id,
        metadata_json={"vendedor_id": str(vendedor_id), "monto_total": str(total)},
    )
    await session.commit()
    return liquidacion


async def obtener_liquidacion(
    session: AsyncSession, liquidacion_id: uuid.UUID
) -> ComisionLiquidacion | None:
    res = await session.execute(
        select(ComisionLiquidacion).where(ComisionLiquidacion.id == liquidacion_id)
    )
    return res.scalar_one_or_none()


async def detalle_liquidacion(
    session: AsyncSession, liquidacion_id: uuid.UUID
) -> list[ComisionLiquidacionDetalle]:
    res = await session.execute(
        select(ComisionLiquidacionDetalle).where(
            ComisionLiquidacionDetalle.liquidacion_id == liquidacion_id
        )
    )
    return list(res.scalars().all())


async def listar_liquidaciones(
    session: AsyncSession, *, vendedor_id: uuid.UUID | None = None
) -> list[ComisionLiquidacion]:
    stmt = select(ComisionLiquidacion).order_by(ComisionLiquidacion.created_at.desc())
    if vendedor_id is not None:
        stmt = stmt.where(ComisionLiquidacion.vendedor_id == vendedor_id)
    res = await session.execute(stmt)
    return list(res.scalars().all())


async def aprobar_liquidacion(
    session: AsyncSession,
    *,
    liquidacion: ComisionLiquidacion,
    actor_id: uuid.UUID | None,
) -> ComisionLiquidacion:
    if liquidacion.estado != "borrador":
        raise ErrorAPI(
            "transicion_invalida",
            f"solo se aprueba un borrador (estado={liquidacion.estado})",
            status=409,
        )
    from datetime import datetime

    liquidacion.estado = "aprobada"
    liquidacion.aprobada_por = actor_id
    liquidacion.aprobada_en = datetime.now(UTC)
    await session.flush()
    await escribir_evento(
        session, actor_id=actor_id, accion="comision_liquidacion_aprobar",
        entidad="comision_liquidacion", entidad_id=liquidacion.id,
    )
    await session.commit()
    return liquidacion


async def pagar_liquidacion(
    session: AsyncSession,
    *,
    liquidacion_id: uuid.UUID,
    caja_id: uuid.UUID,
    fecha_negocio: date | None,
    idempotency_key: str,
    actor_id: uuid.UUID | None,
) -> ComisionLiquidacion:
    """Paga una liquidacion aprobada con un EGRESO de caja, atomico e idempotente.

    liquidacion.monto_total == monto del egreso == sum(detalle.monto). Un solo commit;
    se bloquea la caja. Marca la liquidacion `pagada` y sus devengos `liquidada`.
    """
    operacion = "comision_liquidacion_pagar"
    previo = await guardar_resultado_idempotente(
        session, idempotency_key, operacion, None
    )
    if previo is not None:
        lid = uuid.UUID(json.loads(previo)["id"])
        liq = await obtener_liquidacion(session, lid)
        if liq is None:
            raise RuntimeError(f"liquidacion idempotente {lid} no encontrada")
        return liq

    liquidacion = await bloquear_liquidacion(session, liquidacion_id)
    if liquidacion.estado != "aprobada":
        raise ErrorAPI(
            "transicion_invalida",
            f"solo se paga una liquidacion aprobada (estado={liquidacion.estado})",
            status=409,
        )

    # Re-validar al momento de pagar: un devengo clawbackeado entre generar y pagar
    # NO se paga. Se recomputa el total pagadero desde los detalles cuyo devengo sigue
    # liquidable (estado devengada/confirmada). Los clawbackeados se excluyen del egreso
    # y NO se fuerzan a 'liquidada'.
    detalles = await detalle_liquidacion(session, liquidacion.id)
    ids = [d.comision_devengo_id for d in detalles]
    liquidables: list[ComisionDevengo] = []
    if ids:
        res = await session.execute(
            select(ComisionDevengo).where(
                ComisionDevengo.id.in_(ids),
                ComisionDevengo.estado.in_(["devengada", "confirmada"]),
            )
        )
        liquidables = list(res.scalars().all())
    montos = [d.monto or CERO for d in liquidables]
    total_pagadero = redondear(sumar(*montos)) if montos else CERO

    fneg = fecha_negocio or date.today()
    caja = await bloquear_caja(session, caja_id)
    egreso = await registrar_movimiento(
        session, caja, tipo="egreso", monto=total_pagadero,
        fecha_negocio=fneg, concepto="liquidacion de comisiones",
        categoria="comisiones", referencia=str(liquidacion.id),
    )
    liquidacion.egreso_id = egreso.id
    liquidacion.estado = "pagada"
    liquidacion.monto_total = total_pagadero

    # Solo los devengos efectivamente pagados pasan a 'liquidada'.
    for d in liquidables:
        d.estado = "liquidada"
    await session.flush()

    out = {"id": str(liquidacion.id), "egreso_id": str(egreso.id)}
    await _rellenar_idem(session, idempotency_key, operacion, out)
    await escribir_evento(
        session, actor_id=actor_id, accion="comision_liquidacion_pagar",
        entidad="comision_liquidacion", entidad_id=liquidacion.id,
        metadata_json={"egreso_id": str(egreso.id),
                       "monto": str(liquidacion.monto_total)},
    )
    await session.commit()
    return liquidacion


async def _rellenar_idem(
    session: AsyncSession, clave: str, operacion: str, out: dict
) -> None:
    res = await session.execute(
        select(IdempotencyKey).where(
            IdempotencyKey.clave == clave, IdempotencyKey.operacion == operacion
        )
    )
    fila = res.scalar_one()
    fila.respuesta_json = json.dumps(out)
    await session.flush()
