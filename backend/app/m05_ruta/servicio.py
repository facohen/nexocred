import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auditoria import escribir_evento
from app.errors import ErrorAPI
from app.locking import bloquear_prestamo
from app.m03_prestamos.reconstruccion import (
    cronograma_desde_cuotas,
    imputaciones_core,
)
from app.m04_pagos.servicio import registrar_pago_uow
from app.m05_ruta.modelos import Rendicion, RendicionDescargo
from app.modelos_stub import Cuota, Imputacion, Pago, ParadaRuta, Prestamo, RutaDiaria
from nexocred_core import calcular_saldo_exigible, redondear, restar, sumar

RESULTADOS_VALIDOS = {"pago", "parcial", "promesa", "ausente", "se_niega", "cancelado"}
RESULTADOS_CON_PAGO = {"pago", "parcial"}


async def _cuotas(session: AsyncSession, prestamo_id: uuid.UUID) -> list[Cuota]:
    res = await session.execute(
        select(Cuota).where(Cuota.prestamo_id == prestamo_id).order_by(Cuota.numero)
    )
    return list(res.scalars().all())


async def _imputaciones(
    session: AsyncSession, prestamo_id: uuid.UUID
) -> list[Imputacion]:
    res = await session.execute(
        select(Imputacion)
        .join(Pago, Imputacion.pago_id == Pago.id)
        .where(Pago.prestamo_id == prestamo_id)
    )
    return list(res.scalars().all())


async def saldo_exigible_prestamo(
    session: AsyncSession, prestamo: Prestamo, fecha: date
) -> Decimal:
    cuotas = await _cuotas(session, prestamo.id)
    if not cuotas:
        return Decimal("0")
    crono = cronograma_desde_cuotas(cuotas)
    imps = imputaciones_core(await _imputaciones(session, prestamo.id))
    tasa_pun = prestamo.tasa_punitorio_diario or Decimal("0")
    saldo = calcular_saldo_exigible(crono, imps, fecha, tasa_pun)
    return saldo.total_exigible


async def generar_ruta(
    session: AsyncSession,
    *,
    cobrador_id: uuid.UUID,
    fecha: date,
    actor_id: uuid.UUID | None,
) -> RutaDiaria:
    ruta = RutaDiaria(cobrador_id=cobrador_id, fecha=fecha, estado="abierta")
    session.add(ruta)
    await session.flush()

    # Prestamos con saldo exigible > 0 a la fecha (vigentes / en mora).
    res = await session.execute(
        select(Prestamo).where(
            Prestamo.estado.in_(["vigente", "en_mora"])
        )
    )
    candidatos = list(res.scalars().all())
    orden = 1
    for prestamo in candidatos:
        saldo = await saldo_exigible_prestamo(session, prestamo, fecha)
        if saldo > Decimal("0"):
            session.add(
                ParadaRuta(
                    ruta_id=ruta.id,
                    prestamo_id=prestamo.id,
                    orden=orden,
                )
            )
            orden += 1
    await session.flush()
    await escribir_evento(
        session, actor_id=actor_id, accion="ruta_generacion", entidad="ruta_diaria",
        entidad_id=ruta.id,
        metadata_json={"cobrador_id": str(cobrador_id), "paradas": orden - 1},
    )
    await session.commit()
    return ruta


async def obtener_ruta(
    session: AsyncSession, ruta_id: uuid.UUID
) -> RutaDiaria | None:
    res = await session.execute(select(RutaDiaria).where(RutaDiaria.id == ruta_id))
    return res.scalar_one_or_none()


async def listar_rutas(
    session: AsyncSession,
    *,
    fecha: date | None = None,
    estado: str | None = None,
    cobrador_id: uuid.UUID | None = None,
) -> list[RutaDiaria]:
    stmt = select(RutaDiaria).order_by(RutaDiaria.created_at.desc())
    if fecha is not None:
        stmt = stmt.where(RutaDiaria.fecha == fecha)
    if estado is not None:
        stmt = stmt.where(RutaDiaria.estado == estado)
    if cobrador_id is not None:
        stmt = stmt.where(RutaDiaria.cobrador_id == cobrador_id)
    res = await session.execute(stmt)
    return list(res.scalars().all())


async def paradas_de_ruta(
    session: AsyncSession, ruta_id: uuid.UUID
) -> list[ParadaRuta]:
    res = await session.execute(
        select(ParadaRuta)
        .where(ParadaRuta.ruta_id == ruta_id)
        .order_by(ParadaRuta.orden)
    )
    return list(res.scalars().all())


async def obtener_parada(
    session: AsyncSession, parada_id: uuid.UUID
) -> ParadaRuta | None:
    res = await session.execute(select(ParadaRuta).where(ParadaRuta.id == parada_id))
    return res.scalar_one_or_none()


async def visitar(
    session: AsyncSession,
    *,
    ruta: RutaDiaria,
    parada: ParadaRuta,
    resultado: str,
    monto_cobrado: Decimal | None,
    foto_url: str | None,
    lat: str | None,
    lng: str | None,
    notas: str | None,
    caja_id: uuid.UUID | None,
    fecha_negocio: date | None,
    actor_id: uuid.UUID | None,
) -> tuple[ParadaRuta, uuid.UUID | None]:
    if resultado not in RESULTADOS_VALIDOS:
        raise ErrorAPI(
            "resultado_invalido", f"resultado invalido: {resultado}", status=422
        )
    fneg = fecha_negocio or ruta.fecha or date.today()
    pago_id: uuid.UUID | None = None

    if resultado in RESULTADOS_CON_PAGO and monto_cobrado and monto_cobrado > Decimal("0"):
        if caja_id is None:
            raise ErrorAPI(
                "caja_requerida", "se requiere caja_id para registrar cobro", status=422
            )
        # Lock del prestamo y registro de pago en la MISMA transaccion (un solo commit).
        await bloquear_prestamo(session, parada.prestamo_id)
        _out, pago = await registrar_pago_uow(
            session,
            prestamo_id=parada.prestamo_id,
            monto=monto_cobrado,
            canal="ruta",
            caja_id=caja_id,
            fecha_negocio=fneg,
            idempotency_key=None,
            actor_id=actor_id,
        )
        if pago is not None:
            pago.parada_id = parada.id
            pago_id = pago.id

    parada.resultado = resultado
    parada.monto_cobrado = monto_cobrado
    parada.foto_url = foto_url
    parada.lat = Decimal(lat) if lat is not None else None
    parada.lng = Decimal(lng) if lng is not None else None
    parada.notas = notas
    parada.visitada_en = datetime.now(UTC)
    await session.flush()
    await escribir_evento(
        session, actor_id=actor_id, accion="ruta_visita", entidad="parada_ruta",
        entidad_id=parada.id,
        metadata_json={"resultado": resultado, "pago_id": str(pago_id) if pago_id else None},
    )
    await session.commit()
    return parada, pago_id


# ---------- Rendicion ----------
async def _total_cobrado_ruta(
    session: AsyncSession, ruta_id: uuid.UUID
) -> Decimal:
    """Suma de los pagos vinculados a paradas de la ruta."""
    paradas = await paradas_de_ruta(session, ruta_id)
    ids = [p.id for p in paradas]
    if not ids:
        return Decimal("0")
    res = await session.execute(
        select(Pago.monto).where(
            Pago.parada_id.in_(ids), Pago.estado == "aplicado"
        )
    )
    montos = [m for (m,) in res.all() if m is not None]
    return sumar(*montos) if montos else Decimal("0")


async def generar_rendicion(
    session: AsyncSession,
    *,
    ruta_id: uuid.UUID,
    fecha_negocio: date | None,
    actor_id: uuid.UUID | None,
) -> Rendicion:
    ruta = await obtener_ruta(session, ruta_id)
    if ruta is None:
        raise ErrorAPI("ruta_no_encontrada", "ruta inexistente", status=404)
    existente = await session.execute(
        select(Rendicion).where(Rendicion.ruta_id == ruta_id)
    )
    if existente.scalar_one_or_none() is not None:
        raise ErrorAPI(
            "rendicion_ya_existe", "la ruta ya tiene una rendicion", status=409
        )
    fneg = fecha_negocio or ruta.fecha or date.today()
    total = await _total_cobrado_ruta(session, ruta_id)
    rendicion = Rendicion(
        ruta_id=ruta_id,
        cobrador_id=ruta.cobrador_id,
        fecha_negocio=fneg,
        total_cobrado=total,
        total_descargos=Decimal("0"),
        diferencia=total,
        estado="abierta",
    )
    session.add(rendicion)
    await session.flush()
    await escribir_evento(
        session, actor_id=actor_id, accion="rendicion_apertura", entidad="rendicion",
        entidad_id=rendicion.id, metadata_json={"total_cobrado": str(total)},
    )
    await session.commit()
    return rendicion


async def obtener_rendicion(
    session: AsyncSession, rendicion_id: uuid.UUID
) -> Rendicion | None:
    res = await session.execute(
        select(Rendicion).where(Rendicion.id == rendicion_id)
    )
    return res.scalar_one_or_none()


async def listar_rendiciones(session: AsyncSession) -> list[Rendicion]:
    res = await session.execute(
        select(Rendicion).order_by(Rendicion.created_at.desc())
    )
    return list(res.scalars().all())


async def descargos_de(
    session: AsyncSession, rendicion_id: uuid.UUID
) -> list[RendicionDescargo]:
    res = await session.execute(
        select(RendicionDescargo)
        .where(RendicionDescargo.rendicion_id == rendicion_id)
        .order_by(RendicionDescargo.created_at)
    )
    return list(res.scalars().all())


async def _recalcular_diferencia(
    session: AsyncSession, rendicion: Rendicion
) -> None:
    descargos = await descargos_de(session, rendicion.id)
    aprobados = [d.monto for d in descargos if d.estado == "aprobado"]
    total_aprob = sumar(*aprobados) if aprobados else Decimal("0")
    rendicion.total_descargos = redondear(total_aprob)
    rendicion.diferencia = redondear(restar(rendicion.total_cobrado, total_aprob))
    await session.flush()


async def agregar_descargo(
    session: AsyncSession,
    *,
    rendicion: Rendicion,
    concepto: str,
    monto: Decimal,
    actor_id: uuid.UUID | None,
) -> RendicionDescargo:
    if rendicion.estado in ("aprobada",):
        raise ErrorAPI(
            "rendicion_cerrada", "no se agregan descargos a una rendicion aprobada",
            status=409,
        )
    descargo = RendicionDescargo(
        rendicion_id=rendicion.id,
        concepto=concepto,
        monto=monto,
        estado="pendiente",
    )
    session.add(descargo)
    await session.flush()
    await escribir_evento(
        session, actor_id=actor_id, accion="rendicion_descargo_alta",
        entidad="rendicion_descargo", entidad_id=descargo.id,
        metadata_json={"monto": str(monto)},
    )
    await session.commit()
    return descargo


async def decidir_descargo(
    session: AsyncSession,
    *,
    rendicion: Rendicion,
    descargo_id: uuid.UUID,
    estado: str,
    actor_id: uuid.UUID | None,
) -> RendicionDescargo:
    if estado not in ("aprobado", "rechazado"):
        raise ErrorAPI("estado_invalido", f"estado invalido: {estado}", status=422)
    res = await session.execute(
        select(RendicionDescargo).where(RendicionDescargo.id == descargo_id)
    )
    descargo = res.scalar_one_or_none()
    if descargo is None or descargo.rendicion_id != rendicion.id:
        raise ErrorAPI("descargo_no_encontrado", "descargo inexistente", status=404)
    descargo.estado = estado
    descargo.aprobado_por = actor_id
    await session.flush()
    await _recalcular_diferencia(session, rendicion)
    await escribir_evento(
        session, actor_id=actor_id, accion="rendicion_descargo_decision",
        entidad="rendicion_descargo", entidad_id=descargo.id,
        metadata_json={"estado": estado},
    )
    await session.commit()
    return descargo


_TRANSICIONES = {
    "abierta": {"presentada"},
    "presentada": {"aprobada", "observada"},
    "observada": {"presentada"},
    "aprobada": set(),
}


async def cambiar_estado_rendicion(
    session: AsyncSession,
    *,
    rendicion: Rendicion,
    estado: str,
    actor_id: uuid.UUID | None,
) -> Rendicion:
    permitidos = _TRANSICIONES.get(rendicion.estado, set())
    if estado not in permitidos:
        raise ErrorAPI(
            "transicion_invalida",
            f"no se puede pasar de {rendicion.estado} a {estado}",
            status=409,
        )
    if estado == "aprobada":
        await _recalcular_diferencia(session, rendicion)
    rendicion.estado = estado
    await session.flush()
    await escribir_evento(
        session, actor_id=actor_id, accion="rendicion_estado", entidad="rendicion",
        entidad_id=rendicion.id, metadata_json={"estado": estado},
    )
    await session.commit()
    return rendicion
