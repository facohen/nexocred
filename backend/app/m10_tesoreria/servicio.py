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
from app.m07_riesgo.metricas import perdida_esperada
from app.m07_riesgo.servicio import cartera_riesgo
from app.m10_tesoreria.modelos import AporteRetiro
from app.finanzas import prorratear_costo
from app.parametros_globales import costo_capital_anual
from app.modelos_stub import Cuota, Prestamo
from nexocred_core import CERO, redondear, restar, sumar

# Heuristicas POC documentadas:
# - DCF: tasa de descuento mensual = costo de capital anual / 12 (equivalente
#   simple). Escenarios opt/pes ajustan la tasa +-1pp Y aplican un haircut por
#   perdida esperada de cartera sobre los flujos (no solo cambian la tasa).
_ESCALA_TASA = Decimal("0.0001")
# Multiplicadores de haircut por escenario sobre la PE ratio de cartera: el
# optimista asume menos perdida que la esperada, el pesimista mas.
_HAIRCUT_ESCENARIO = {
    "optimista": Decimal("0.5"),
    "base": Decimal("1.0"),
    "pesimista": Decimal("1.5"),
}
# Ajuste de tasa de descuento por escenario (pp mensuales sobre la base).
_AJUSTE_TASA_ESCENARIO = {
    "optimista": Decimal("-0.01"),
    "base": Decimal("0"),
    "pesimista": Decimal("0.01"),
}


def _tasa_descuento_mensual_base() -> Decimal:
    """Tasa de descuento mensual base = costo de capital anual / 12."""
    return (costo_capital_anual() / Decimal(12)).quantize(_ESCALA_TASA)


async def _pe_ratio_cartera(session: AsyncSession, fecha: date) -> Decimal:
    """Ratio de perdida esperada de la cartera (PE monetaria / capital outstanding).
    Se usa como haircut base de los flujos en el DCF por escenario."""
    cartera = await cartera_riesgo(session, fecha)
    if not cartera:
        return CERO
    total = sumar(*(c.capital_pendiente for c in cartera))
    if total == CERO:
        return CERO
    pe = perdida_esperada(cartera)
    return (pe / total).quantize(_ESCALA_TASA)


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


def _egreso_fondeo(capital_colocado: Decimal, dias_tramo: int) -> Decimal:
    """Costo de fondeo del capital colocado agregado, prorrateado al tramo."""
    return prorratear_costo(capital_colocado, costo_capital_anual(), dias_tramo)


async def cashflow(
    session: AsyncSession,
    fecha: date,
    dias: int,
    horizontes_meses: list[int] | None = None,
) -> dict:
    """Cashflow proyectado. Entradas = cuotas que vencen en el tramo. Egresos =
    costo de fondeo del capital colocado prorrateado al tramo (antes 0). Si se
    pasan `horizontes_meses`, los tramos son por meses; si no, se mantiene el
    comportamiento historico por dias (30/60/90 acotado por `dias`)."""
    cuotas = await _cuotas_pendientes(session, fecha)
    capital_colocado = await _capital_colocado(session, fecha)
    tramos = []

    if horizontes_meses:
        for meses in sorted(set(horizontes_meses)):
            dias_tramo = meses * 30
            limite = fecha + timedelta(days=dias_tramo)
            entradas = [m for v, m in cuotas if fecha <= v <= limite]
            total_ent = redondear(sumar(*entradas)) if entradas else CERO
            egresos = _egreso_fondeo(capital_colocado, dias_tramo)
            tramos.append({
                "dias": dias_tramo,
                "meses": meses,
                "entradas": total_ent,
                "egresos": egresos,
                "neto": redondear(restar(total_ent, egresos)),
            })
        return {"tramos": tramos}

    for horizonte in (30, 60, 90):
        if horizonte > dias:
            continue
        limite = fecha + timedelta(days=horizonte)
        entradas = [m for v, m in cuotas if fecha <= v <= limite]
        total_ent = redondear(sumar(*entradas)) if entradas else CERO
        egresos = _egreso_fondeo(capital_colocado, horizonte)
        tramos.append({
            "dias": horizonte,
            "meses": None,
            "entradas": total_ent,
            "egresos": egresos,
            "neto": redondear(restar(total_ent, egresos)),
        })
    return {"tramos": tramos}


def _ventana(meses: int) -> str:
    if meses < 6:
        return "0-6m"
    if meses < 12:
        return "6-12m"
    return "12m+"


async def dcf(session: AsyncSession, fecha: date) -> dict:
    """Valor presente de los flujos futuros. La tasa de descuento base sale del
    costo de capital; cada escenario ajusta la tasa (+-1pp) Y aplica un haircut por
    perdida esperada de cartera sobre los flujos. Devuelve ademas el VP repartido
    por ventana temporal y una curva de VP acumulado (escenario base) para graficar."""
    cuotas = await _cuotas_pendientes(session, fecha)
    futuras = sorted(((v, m) for v, m in cuotas if v >= fecha), key=lambda t: t[0])
    nominal = redondear(sumar(*(m for _, m in futuras))) if futuras else CERO
    tasa_base = _tasa_descuento_mensual_base()
    pe_ratio = await _pe_ratio_cartera(session, fecha)

    escenarios = []
    curva: list[dict] = []
    for nombre in ("base", "optimista", "pesimista"):
        tasa = tasa_base + _AJUSTE_TASA_ESCENARIO[nombre]
        if tasa < CERO:
            tasa = CERO
        # haircut: fraccion de cada flujo que se asume incobrable en el escenario.
        haircut = pe_ratio * _HAIRCUT_ESCENARIO[nombre]
        if haircut > Decimal("1"):
            haircut = Decimal("1")
        factor_cobro = Decimal("1") - haircut

        vp_total = CERO
        por_ventana: dict[str, Decimal] = {"0-6m": CERO, "6-12m": CERO, "12m+": CERO}
        vp_acum = CERO
        for venc, monto in futuras:
            meses = max((venc - fecha).days // 30, 0)
            factor = (Decimal("1") + tasa) ** meses
            vp_flujo = (monto * factor_cobro / factor).quantize(Decimal("0.01"))
            vp_total = sumar(vp_total, vp_flujo)
            por_ventana[_ventana(meses)] = sumar(por_ventana[_ventana(meses)], vp_flujo)
            if nombre == "base":
                vp_acum = sumar(vp_acum, vp_flujo)
                curva.append({"mes": meses, "vp_acumulado": redondear(vp_acum)})

        escenarios.append({
            "escenario": nombre,
            "tasa_mensual": tasa,
            "valor_presente": redondear(vp_total),
            "vp_por_horizonte": [
                {"etiqueta": et, "valor_presente": redondear(por_ventana[et])}
                for et in ("0-6m", "6-12m", "12m+")
            ],
        })
    return {"flujos_nominales": nominal, "escenarios": escenarios, "curva": curva}


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
            # No usar assert: con python -O desaparece y devolvería None tipado mal.
            if fila is None:
                raise ErrorAPI(
                    "inconsistencia_idempotencia",
                    "el aporte/retiro idempotente referenciado no existe",
                    status=500,
                )
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
