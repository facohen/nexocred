import json
import uuid
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auditoria import escribir_evento
from app.errors import ErrorAPI
from app.idempotencia import guardar_resultado_idempotente
from app.locking import bloquear_caja, bloquear_solicitud
from app.m02_originacion.schemas import DesembolsoOut
from app.m03_prestamos.reconstruccion import snapshot_desde_terminos
from app.modelos_stub import Cuota, MovimientoCaja, Prestamo, SolicitudCredito
from nexocred_core import Periodicidad, TerminosPrestamo, calcular_cronograma


def _fecha_primera_cuota_default(fecha_negocio: date) -> date:
    return fecha_negocio + timedelta(days=30)


async def materializar_prestamo(
    session: AsyncSession,
    *,
    persona_id: uuid.UUID,
    producto_id: uuid.UUID,
    solicitud_id: uuid.UUID | None,
    terminos: TerminosPrestamo,
    fecha_desembolso: date,
    vendedor_id: uuid.UUID | None = None,
    estado: str = "vigente",
    zona_id: uuid.UUID | None = None,
    sector_id: uuid.UUID | None = None,
) -> Prestamo:
    """Crea un prestamo con snapshot inmutable + cronograma materializado en filas cuota.
    Reutilizado por desembolso (M02) y novaciones (M06)."""
    crono = calcular_cronograma(terminos)
    snap = snapshot_desde_terminos(terminos)
    if zona_id is not None:
        snap["zona"] = str(zona_id)
    if sector_id is not None:
        snap["sector"] = str(sector_id)
    prestamo = Prestamo(
        persona_id=persona_id,
        producto_id=producto_id,
        solicitud_id=solicitud_id,
        capital=terminos.capital,
        estado=estado,
        snapshot_terminos=snap,
        fecha_desembolso=fecha_desembolso,
        tasa_punitorio_diario=terminos.tasa_punitorio_diario,
        vendedor_id=vendedor_id,
        monto_desembolsado=terminos.capital,
    )
    session.add(prestamo)
    await session.flush()
    for fila in crono.filas:
        session.add(
            Cuota(
                prestamo_id=prestamo.id,
                numero=fila.numero,
                vencimiento=fila.vencimiento,
                capital=fila.capital,
                interes=fila.interes,
                cuota=fila.cuota,
                punitorio_acumulado=Decimal("0"),
                estado="pendiente",
            )
        )
    await session.flush()
    return prestamo


async def desembolsar(
    session: AsyncSession,
    *,
    solicitud: SolicitudCredito,
    caja_id: uuid.UUID,
    fecha_negocio: date | None,
    fecha_primera_cuota: date | None,
    tasa_punitorio_diario: Decimal,
    idempotency_key: str,
    actor_id: uuid.UUID | None,
) -> DesembolsoOut:
    operacion = "desembolsar"
    previo = await guardar_resultado_idempotente(
        session, idempotency_key, operacion, None
    )
    if previo is not None:
        await session.commit()
        return DesembolsoOut.model_validate(json.loads(previo))

    # Acquire row lock BEFORE reading estado to prevent double-disbursement
    # under concurrent requests (spec C1 fix: SELECT FOR UPDATE serialises access).
    solicitud = await bloquear_solicitud(session, solicitud.id)

    if solicitud.estado != "aprobada":
        raise ErrorAPI(
            "transicion_invalida",
            f"solo se desembolsa una solicitud aprobada (estado={solicitud.estado})",
            status=409,
        )
    if solicitud.tasa_resuelta is None:
        raise ErrorAPI(
            "solicitud_no_evaluada",
            "la solicitud no tiene tasa resuelta",
            status=409,
        )

    fneg = fecha_negocio or date.today()
    fpc = fecha_primera_cuota or _fecha_primera_cuota_default(fneg)

    # Lock de caja: operacion que mueve saldo (§5.7).
    caja = await bloquear_caja(session, caja_id)

    terminos = TerminosPrestamo(
        capital=solicitud.monto or Decimal("0"),
        tasa_interes_directo=solicitud.tasa_resuelta,
        cantidad_cuotas=solicitud.cantidad_cuotas or 1,
        periodicidad=Periodicidad.MENSUAL,
        fecha_primera_cuota=fpc,
        tasa_punitorio_diario=tasa_punitorio_diario,
    )
    crono = calcular_cronograma(terminos)

    snap = snapshot_desde_terminos(terminos)
    if solicitud.zona_id is not None:
        snap["zona"] = str(solicitud.zona_id)
    if solicitud.sector_id is not None:
        snap["sector"] = str(solicitud.sector_id)
    prestamo = Prestamo(
        persona_id=solicitud.persona_id,
        producto_id=solicitud.producto_id,
        solicitud_id=solicitud.id,
        capital=terminos.capital,
        estado="vigente",
        snapshot_terminos=snap,
        fecha_desembolso=fneg,
        tasa_punitorio_diario=tasa_punitorio_diario,
        vendedor_id=solicitud.vendedor_id,
        monto_desembolsado=terminos.capital,
    )
    session.add(prestamo)
    await session.flush()

    for fila in crono.filas:
        session.add(
            Cuota(
                prestamo_id=prestamo.id,
                numero=fila.numero,
                vencimiento=fila.vencimiento,
                capital=fila.capital,
                interes=fila.interes,
                cuota=fila.cuota,
                punitorio_acumulado=Decimal("0"),
                estado="pendiente",
            )
        )

    # Egreso de caja por el capital desembolsado.
    mov = MovimientoCaja(
        caja_id=caja.id,
        tipo="egreso",
        monto=terminos.capital,
        fecha_negocio=fneg,
        concepto="desembolso de prestamo",
        categoria="desembolso",
        referencia=str(prestamo.id),
    )
    session.add(mov)
    caja.saldo_teorico = (caja.saldo_teorico or Decimal("0")) - terminos.capital

    solicitud.estado = "desembolsada"
    await session.flush()

    # Devengo de comision del vendedor (NON-COMMITTING; comparte la transaccion atomica
    # del desembolso). Resuelve % de la matriz producto x perfil sobre el capital.
    from app.m09_comisiones.servicio import devengar_por_desembolso

    await devengar_por_desembolso(
        session, prestamo=prestamo, solicitud=solicitud, fecha_negocio=fneg,
        actor_id=actor_id,
    )

    out = DesembolsoOut(
        prestamo_id=prestamo.id,
        solicitud_id=solicitud.id,
        estado=solicitud.estado,
        capital=terminos.capital,
        cantidad_cuotas=terminos.cantidad_cuotas,
        movimiento_caja_id=mov.id,
    )
    # Persistir resultado idempotente (sobreescribe la fila reservada).
    await _persistir_idempotencia(session, idempotency_key, operacion, out)

    await escribir_evento(
        session, actor_id=actor_id, accion="solicitud_desembolso",
        entidad="prestamo", entidad_id=prestamo.id,
        metadata_json={"solicitud_id": str(solicitud.id), "capital": str(terminos.capital)},
    )
    await session.commit()
    return out


async def _persistir_idempotencia(
    session: AsyncSession, clave: str, operacion: str, out: DesembolsoOut
) -> None:
    from app.idempotencia import IdempotencyKey

    res = await session.execute(
        select(IdempotencyKey).where(
            IdempotencyKey.clave == clave, IdempotencyKey.operacion == operacion
        )
    )
    fila = res.scalar_one()
    fila.respuesta_json = out.model_dump_json()
    await session.flush()
