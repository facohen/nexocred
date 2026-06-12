"""Servicio M10 tesoreria: posicion, cashflow, DCF, rotacion y aportes/retiros.

Todo en Decimal exacto; nunca float. Las lecturas computan sobre caja + cronogramas
de cuotas. Composite ops (aporte/retiro) usan unit-of-work: lock de caja, movimiento
+ fila aporte_retiro, un unico commit, idempotente.
"""

import json
import uuid
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auditoria import escribir_evento
from app.errors import ErrorAPI
from app.idempotencia import guardar_resultado_idempotente
from app.locking import bloquear_caja
from app.m04_caja.servicio import (
    obtener_caja,
    posicion_consolidada,
    registrar_movimiento,
)
from app.m07_riesgo.servicio import cartera_riesgo
from app.m10_tesoreria.modelos import AporteRetiro
from app.modelos_stub import Cuota, Prestamo
from nexocred_core import CERO, redondear, restar, sumar

# Heuristicas POC documentadas:
# - DCF: tasa de descuento mensual base 3%; escenarios opt/pes +-1pp (spec §M10 no
#   fija una tasa, elegimos una consistente con pricing del POC).
_TASA_DCF = {
    "base": Decimal("0.03"),
    "optimista": Decimal("0.02"),
    "pesimista": Decimal("0.04"),
}
_ESCALA_TASA = Decimal("0.0001")


def _ratio(num: Decimal, den: Decimal) -> Decimal:
    if den == CERO:
        return CERO
    return (num / den).quantize(_ESCALA_TASA)


async def _capital_colocado(session: AsyncSession, fecha: date) -> Decimal:
    cartera = await cartera_riesgo(session, fecha)
    montos = [c.capital_pendiente for c in cartera]
    return redondear(sumar(*montos)) if montos else CERO


async def posicion(session: AsyncSession, fecha: date) -> dict:
    capital_disponible, _ = await posicion_consolidada(session)
    capital_disponible = redondear(capital_disponible)
    capital_colocado = await _capital_colocado(session, fecha)
    base = sumar(capital_disponible, capital_colocado)
    utilizacion = _ratio(capital_colocado, base)
    if utilizacion >= Decimal("0.85"):
        semaforo = "rojo"
    elif utilizacion >= Decimal("0.60"):
        semaforo = "amarillo"
    else:
        semaforo = "verde"
    return {
        "capital_disponible": capital_disponible,
        "capital_colocado": capital_colocado,
        "utilizacion": utilizacion,
        "semaforo": semaforo,
    }


async def _cuotas_pendientes(
    session: AsyncSession, fecha: date
) -> list[tuple[date, Decimal]]:
    """(vencimiento, monto cuota) de cuotas no pagadas con vencimiento >= fecha."""
    res = await session.execute(
        select(Cuota.vencimiento, Cuota.cuota, Cuota.capital, Cuota.interes)
        .join(Prestamo, Cuota.prestamo_id == Prestamo.id)
        .where(
            Prestamo.estado.in_(["vigente", "en_mora"]),
            Cuota.estado.in_(["pendiente", "parcial"]),
            Cuota.vencimiento.is_not(None),
        )
    )
    filas: list[tuple[date, Decimal]] = []
    for venc, cuota, capital, interes in res.all():
        monto = cuota if cuota is not None else sumar(capital or CERO, interes or CERO)
        filas.append((venc, redondear(monto)))
    return filas


async def cashflow(session: AsyncSession, fecha: date, dias: int) -> dict:
    cuotas = await _cuotas_pendientes(session, fecha)
    tramos = []
    for horizonte in (30, 60, 90):
        if horizonte > dias:
            continue
        limite = fecha + timedelta(days=horizonte)
        entradas = [m for v, m in cuotas if fecha <= v <= limite]
        total_ent = redondear(sumar(*entradas)) if entradas else CERO
        egresos = CERO  # POC: sin egresos proyectados (sin nomina/gastos planificados)
        tramos.append({
            "dias": horizonte,
            "entradas": total_ent,
            "egresos": egresos,
            "neto": redondear(restar(total_ent, egresos)),
        })
    return {"tramos": tramos}


async def dcf(session: AsyncSession, fecha: date) -> dict:
    cuotas = await _cuotas_pendientes(session, fecha)
    futuras = [(v, m) for v, m in cuotas if v >= fecha]
    nominal = redondear(sumar(*(m for _, m in futuras))) if futuras else CERO
    escenarios = []
    for nombre, tasa in _TASA_DCF.items():
        vp = CERO
        for venc, monto in futuras:
            meses = max((venc - fecha).days // 30, 0)
            factor = (Decimal("1") + tasa) ** meses
            vp = sumar(vp, (monto / factor).quantize(Decimal("0.01")))
        escenarios.append({
            "escenario": nombre,
            "tasa_mensual": tasa,
            "valor_presente": redondear(vp),
        })
    return {"flujos_nominales": nominal, "escenarios": escenarios}


async def rotacion(session: AsyncSession, fecha: date) -> dict:
    inicio_ano = fecha.replace(month=1, day=1)
    res = await session.execute(
        select(Prestamo.monto_desembolsado, Prestamo.capital).where(
            Prestamo.fecha_desembolso >= inicio_ano,
            Prestamo.fecha_desembolso <= fecha,
        )
    )
    desembolsos = [
        (md if md is not None else (cap or CERO)) for md, cap in res.all()
    ]
    colocacion = redondear(sumar(*desembolsos)) if desembolsos else CERO
    capital_promedio = await _capital_colocado(session, fecha)
    dias_transcurridos = max((fecha - inicio_ano).days, 1)
    # anualizacion: colocacion * (365/dias) / capital promedio
    if capital_promedio == CERO:
        rot = CERO
    else:
        anualizada = colocacion * Decimal(365) / Decimal(dias_transcurridos)
        rot = (anualizada / capital_promedio).quantize(_ESCALA_TASA)
    return {
        "colocacion_periodo": colocacion,
        "capital_promedio": capital_promedio,
        "rotacion_anualizada": rot,
    }


# ---------- Aportes / Retiros (unit-of-work a traves de caja) ----------
async def _crear_aporte_retiro(
    session: AsyncSession,
    *,
    tipo: str,
    monto: Decimal,
    fecha_negocio: date,
    caja_id: uuid.UUID,
    inversor: str | None,
    nota: str | None,
    actor_id: uuid.UUID | None,
    idempotency_key: str | None,
) -> AporteRetiro:
    operacion = f"tesoreria_{tipo}"
    if idempotency_key is not None:
        existente = await guardar_resultado_idempotente(
            session, idempotency_key, operacion, None
        )
        if existente is not None:
            ar_id = uuid.UUID(json.loads(existente)["aporte_retiro_id"])
            fila = await session.get(AporteRetiro, ar_id)
            assert fila is not None
            return fila

    if monto <= CERO:
        raise ErrorAPI("monto_invalido", "el monto debe ser positivo", status=422)

    caja = await bloquear_caja(session, caja_id)
    if tipo == "retiro" and restar(caja.saldo_teorico, monto) < CERO:
        raise ErrorAPI(
            "saldo_insuficiente",
            "el retiro dejaria la caja con saldo negativo",
            status=409,
        )
    tipo_mov = "ingreso" if tipo == "aporte" else "egreso"
    concepto = "aporte de capital" if tipo == "aporte" else "retiro de capital"
    mov = await registrar_movimiento(
        session, caja, tipo=tipo_mov, monto=monto, fecha_negocio=fecha_negocio,
        concepto=concepto, categoria="capital",
    )
    fila = AporteRetiro(
        tipo=tipo, monto=monto, fecha_negocio=fecha_negocio, caja_id=caja_id,
        movimiento_id=mov.id, inversor=inversor, nota=nota, created_by=actor_id,
    )
    session.add(fila)
    await session.flush()

    if idempotency_key is not None:
        from app.idempotencia import IdempotencyKey
        res = await session.execute(
            select(IdempotencyKey).where(
                IdempotencyKey.clave == idempotency_key,
                IdempotencyKey.operacion == operacion,
            )
        )
        idem = res.scalar_one()
        idem.respuesta_json = json.dumps({"aporte_retiro_id": str(fila.id)})

    await escribir_evento(
        session, actor_id=actor_id, accion=f"capital_{tipo}",
        entidad="aporte_retiro", entidad_id=fila.id,
        metadata_json={"monto": str(monto), "caja_id": str(caja_id)},
    )
    await session.commit()
    await session.refresh(fila)
    return fila


async def registrar_aporte(
    session: AsyncSession, datos, *, actor_id, idempotency_key
) -> AporteRetiro:
    return await _crear_aporte_retiro(
        session, tipo="aporte", monto=datos.monto, fecha_negocio=datos.fecha_negocio,
        caja_id=datos.caja_id, inversor=datos.inversor, nota=datos.nota,
        actor_id=actor_id, idempotency_key=idempotency_key,
    )


async def registrar_retiro(
    session: AsyncSession, datos, *, actor_id, idempotency_key
) -> AporteRetiro:
    return await _crear_aporte_retiro(
        session, tipo="retiro", monto=datos.monto, fecha_negocio=datos.fecha_negocio,
        caja_id=datos.caja_id, inversor=datos.inversor, nota=datos.nota,
        actor_id=actor_id, idempotency_key=idempotency_key,
    )


async def listar_aportes_retiros(session: AsyncSession) -> list[AporteRetiro]:
    res = await session.execute(
        select(AporteRetiro).order_by(AporteRetiro.created_at.desc())
    )
    return list(res.scalars().all())


async def caja_existe(session: AsyncSession, caja_id: uuid.UUID) -> bool:
    return await obtener_caja(session, caja_id) is not None
