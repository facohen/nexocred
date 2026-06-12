import json
import math
import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy import update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auditoria import escribir_evento
from app.errors import ErrorAPI
from app.idempotencia import IdempotencyKey, guardar_resultado_idempotente
from app.locking import bloquear_caja, bloquear_prestamo
from app.m02_originacion.servicio_desembolso import materializar_prestamo
from app.m03_prestamos.servicio import payoff as calcular_payoff_prestamo
from app.m04_caja.servicio import registrar_movimiento
from app.m06_novaciones.modelos import Novacion, NovacionOrigen
from app.m06_novaciones.schemas import NovacionOut
from app.modelos_stub import Cuota, Prestamo
from nexocred_core import Periodicidad, TerminosPrestamo, redondear, restar, sumar


def _periodicidad(valor: str) -> Periodicidad:
    try:
        return Periodicidad(valor)
    except ValueError as exc:
        raise ErrorAPI(
            "periodicidad_invalida", f"periodicidad no soportada: {valor}", status=422
        ) from exc


async def _idem_previo(
    session: AsyncSession, clave: str, operacion: str
) -> NovacionOut | None:
    previo = await guardar_resultado_idempotente(session, clave, operacion, None)
    if previo is not None:
        await session.commit()
        return NovacionOut.model_validate(json.loads(previo))
    return None


async def _guardar_idem(
    session: AsyncSession, clave: str, operacion: str, out: NovacionOut
) -> None:
    res = await session.execute(
        select(IdempotencyKey).where(
            IdempotencyKey.clave == clave, IdempotencyKey.operacion == operacion
        )
    )
    fila = res.scalar_one()
    fila.respuesta_json = out.model_dump_json()
    await session.flush()


async def _crear_novacion(
    session: AsyncSession,
    *,
    tipo: str,
    origenes: list[Prestamo],
    nuevo_prestamo: Prestamo,
    actor_id: uuid.UUID | None,
) -> Novacion:
    nov = Novacion(
        tipo=tipo,
        estado="confirmada",
        nuevo_prestamo_id=nuevo_prestamo.id,
        creado_por=actor_id,
    )
    session.add(nov)
    await session.flush()
    for origen in origenes:
        session.add(NovacionOrigen(novacion_id=nov.id, prestamo_id=origen.id))
        origen.estado = "novado"
        await session.execute(
            sa_update(Cuota)
            .where(
                Cuota.prestamo_id == origen.id,
                Cuota.estado.in_(["pendiente", "parcial"]),
            )
            .values(estado="cancelada")
        )
    await session.flush()
    await escribir_evento(
        session, actor_id=actor_id, accion="novacion_confirmada", entidad="novacion",
        entidad_id=nov.id,
        metadata_json={"tipo": tipo, "nuevo": str(nuevo_prestamo.id),
                       "origenes": [str(o.id) for o in origenes]},
    )
    return nov


async def _payoff_total(
    session: AsyncSession, prestamos: list[Prestamo], fecha_negocio: date
) -> Decimal:
    totales = []
    for p in prestamos:
        res = await calcular_payoff_prestamo(session, p, fecha_negocio)
        totales.append(res.total)
    return sumar(*totales) if totales else Decimal("0")


async def _confirmar(
    session: AsyncSession,
    *,
    tipo: str,
    origenes_ids: list[uuid.UUID],
    persona_id: uuid.UUID,
    producto_id: uuid.UUID,
    capital: Decimal,
    tasa: Decimal,
    cantidad_cuotas: int,
    periodicidad: str,
    fecha_primera_cuota: date,
    fecha_negocio: date,
    actor_id: uuid.UUID | None,
) -> Prestamo:
    terminos = TerminosPrestamo(
        capital=capital,
        tasa_interes_directo=tasa,
        cantidad_cuotas=cantidad_cuotas,
        periodicidad=_periodicidad(periodicidad),
        fecha_primera_cuota=fecha_primera_cuota,
    )
    nuevo = await materializar_prestamo(
        session, persona_id=persona_id, producto_id=producto_id,
        solicitud_id=None, terminos=terminos, fecha_desembolso=fecha_negocio,
    )
    return nuevo


async def refinanciar(
    session: AsyncSession,
    *,
    prestamo_id: uuid.UUID,
    caja_id: uuid.UUID,
    fecha_negocio: date,
    tasa: Decimal,
    cantidad_cuotas: int,
    periodicidad: str,
    fecha_primera_cuota: date,
    idempotency_key: str,
    actor_id: uuid.UUID | None,
) -> NovacionOut:
    # refinanciar/consolidar/transferir son ROLLOVERS PUROS: el payoff del/los origen
    # se convierte en capital del nuevo prestamo sin que entre ni salga efectivo, por
    # lo que NO se asienta movimiento de caja (a diferencia de repactar_rapido, que si
    # recibe un pago a cuenta en efectivo). caja_id se conserva por simetria de API.
    operacion = "novacion_refinanciar"
    if (previo := await _idem_previo(session, idempotency_key, operacion)) is not None:
        return previo
    origen = await bloquear_prestamo(session, prestamo_id)
    _validar_origen(origen)
    capital = await _payoff_total(session, [origen], fecha_negocio)
    nuevo = await _confirmar(
        session, tipo="refinanciacion", origenes_ids=[prestamo_id],
        persona_id=origen.persona_id, producto_id=origen.producto_id,
        capital=capital, tasa=tasa, cantidad_cuotas=cantidad_cuotas,
        periodicidad=periodicidad, fecha_primera_cuota=fecha_primera_cuota,
        fecha_negocio=fecha_negocio, actor_id=actor_id,
    )
    nov = await _crear_novacion(
        session, tipo="refinanciacion", origenes=[origen], nuevo_prestamo=nuevo,
        actor_id=actor_id,
    )
    out = NovacionOut.model_validate(nov)
    await _guardar_idem(session, idempotency_key, operacion, out)
    await session.commit()
    return out


async def consolidar(
    session: AsyncSession,
    *,
    prestamo_ids: list[uuid.UUID],
    caja_id: uuid.UUID,
    fecha_negocio: date,
    tasa: Decimal,
    cantidad_cuotas: int,
    periodicidad: str,
    fecha_primera_cuota: date,
    idempotency_key: str,
    actor_id: uuid.UUID | None,
) -> NovacionOut:
    operacion = "novacion_consolidar"
    if (previo := await _idem_previo(session, idempotency_key, operacion)) is not None:
        return previo
    origenes = []
    for pid in prestamo_ids:
        origen = await bloquear_prestamo(session, pid)
        _validar_origen(origen)
        origenes.append(origen)
    personas = {o.persona_id for o in origenes}
    if len(personas) != 1:
        raise ErrorAPI(
            "consolidacion_invalida",
            "todos los prestamos a consolidar deben ser del mismo deudor",
            status=422,
        )
    capital = await _payoff_total(session, origenes, fecha_negocio)
    nuevo = await _confirmar(
        session, tipo="consolidacion", origenes_ids=prestamo_ids,
        persona_id=origenes[0].persona_id, producto_id=origenes[0].producto_id,
        capital=capital, tasa=tasa, cantidad_cuotas=cantidad_cuotas,
        periodicidad=periodicidad, fecha_primera_cuota=fecha_primera_cuota,
        fecha_negocio=fecha_negocio, actor_id=actor_id,
    )
    nov = await _crear_novacion(
        session, tipo="consolidacion", origenes=origenes, nuevo_prestamo=nuevo,
        actor_id=actor_id,
    )
    out = NovacionOut.model_validate(nov)
    await _guardar_idem(session, idempotency_key, operacion, out)
    await session.commit()
    return out


async def transferir(
    session: AsyncSession,
    *,
    prestamo_id: uuid.UUID,
    nuevo_deudor_id: uuid.UUID,
    caja_id: uuid.UUID,
    fecha_negocio: date,
    tasa: Decimal | None,
    cantidad_cuotas: int,
    periodicidad: str,
    fecha_primera_cuota: date,
    idempotency_key: str,
    actor_id: uuid.UUID | None,
) -> NovacionOut:
    operacion = "novacion_transferir"
    if (previo := await _idem_previo(session, idempotency_key, operacion)) is not None:
        return previo
    origen = await bloquear_prestamo(session, prestamo_id)
    _validar_origen(origen)
    capital = await _payoff_total(session, [origen], fecha_negocio)
    snap = origen.snapshot_terminos or {}
    tasa_usada = tasa if tasa is not None else Decimal(str(snap.get("tasa_interes_directo", "0")))
    nuevo = await _confirmar(
        session, tipo="transferencia", origenes_ids=[prestamo_id],
        persona_id=nuevo_deudor_id, producto_id=origen.producto_id,
        capital=capital, tasa=tasa_usada, cantidad_cuotas=cantidad_cuotas,
        periodicidad=periodicidad, fecha_primera_cuota=fecha_primera_cuota,
        fecha_negocio=fecha_negocio, actor_id=actor_id,
    )
    nov = await _crear_novacion(
        session, tipo="transferencia", origenes=[origen], nuevo_prestamo=nuevo,
        actor_id=actor_id,
    )
    out = NovacionOut.model_validate(nov)
    await _guardar_idem(session, idempotency_key, operacion, out)
    await session.commit()
    return out


async def repactar_rapido(
    session: AsyncSession,
    *,
    prestamo_id: uuid.UUID,
    caja_id: uuid.UUID,
    fecha_negocio: date,
    pago_cuenta: Decimal,
    nueva_cuota: Decimal,
    tasa: Decimal,
    periodicidad: str,
    fecha_primera_cuota: date,
    idempotency_key: str,
    actor_id: uuid.UUID | None,
) -> NovacionOut:
    operacion = "novacion_repactar"
    if (previo := await _idem_previo(session, idempotency_key, operacion)) is not None:
        return previo
    origen = await bloquear_prestamo(session, prestamo_id)
    _validar_origen(origen)
    payoff = await _payoff_total(session, [origen], fecha_negocio)
    # Base de capital: payoff menos el pago a cuenta (decision documentada).
    # MINOR 6: normalizar a 2 decimales antes de materializar el prestamo.
    capital = redondear(restar(payoff, pago_cuenta))
    if capital <= Decimal("0"):
        raise ErrorAPI(
            "repactar_invalido",
            "el pago a cuenta no puede cubrir o exceder el payoff",
            status=422,
        )
    # MAJOR 3: el pago a cuenta es efectivo que entrega el deudor -> debe quedar
    # asentado como INGRESO de caja en la MISMA transaccion (conservacion de dinero).
    if pago_cuenta > Decimal("0"):
        caja = await bloquear_caja(session, caja_id)
        mov = await registrar_movimiento(
            session, caja, tipo="ingreso", monto=redondear(pago_cuenta),
            fecha_negocio=fecha_negocio, concepto="pago a cuenta repactacion",
            categoria="cobranza", referencia=str(prestamo_id),
        )
        await escribir_evento(
            session, actor_id=actor_id, accion="repactar_pago_cuenta",
            entidad="movimiento_caja", entidad_id=mov.id,
            metadata_json={"prestamo_id": str(prestamo_id),
                           "monto": str(redondear(pago_cuenta))},
        )
    # cantidad de cuotas derivada para aproximar la nueva_cuota objetivo.
    total_a_pagar = capital * (Decimal("1") + tasa)
    cantidad_cuotas = max(1, math.ceil(total_a_pagar / nueva_cuota))
    nuevo = await _confirmar(
        session, tipo="repactar_rapido", origenes_ids=[prestamo_id],
        persona_id=origen.persona_id, producto_id=origen.producto_id,
        capital=capital, tasa=tasa, cantidad_cuotas=cantidad_cuotas,
        periodicidad=periodicidad, fecha_primera_cuota=fecha_primera_cuota,
        fecha_negocio=fecha_negocio, actor_id=actor_id,
    )
    nov = await _crear_novacion(
        session, tipo="repactar_rapido", origenes=[origen], nuevo_prestamo=nuevo,
        actor_id=actor_id,
    )
    out = NovacionOut.model_validate(nov)
    await _guardar_idem(session, idempotency_key, operacion, out)
    await session.commit()
    return out


def _validar_origen(prestamo: Prestamo) -> None:
    if prestamo.estado not in ("vigente", "en_mora"):
        raise ErrorAPI(
            "transicion_invalida",
            f"no se puede novar un prestamo en estado {prestamo.estado}",
            status=409,
        )


async def obtener_novacion(
    session: AsyncSession, novacion_id: uuid.UUID
) -> Novacion | None:
    res = await session.execute(select(Novacion).where(Novacion.id == novacion_id))
    return res.scalar_one_or_none()


async def origenes_de(
    session: AsyncSession, novacion_id: uuid.UUID
) -> list[uuid.UUID]:
    res = await session.execute(
        select(NovacionOrigen.prestamo_id).where(
            NovacionOrigen.novacion_id == novacion_id
        )
    )
    return list(res.scalars().all())


async def novaciones_de_prestamo(
    session: AsyncSession, prestamo_id: uuid.UUID
) -> list[Novacion]:
    res = await session.execute(
        select(Novacion)
        .join(NovacionOrigen, NovacionOrigen.novacion_id == Novacion.id)
        .where(NovacionOrigen.prestamo_id == prestamo_id)
        .order_by(Novacion.created_at)
    )
    return list(res.scalars().all())
