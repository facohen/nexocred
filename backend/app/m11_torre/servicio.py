"""Servicio M11 La Torre: KPIs ejecutivos desde el snapshot_cartera persistido +
datos live (alertas, tareas, rutas, cuotas, solicitudes).

INVARIANTE: las metricas de cartera (pulso, resumen, negocio) salen del ULTIMO
snapshot_cartera persistido. Si no hay snapshot, se devuelve estado vacio/cero
explicito (no numeros falsos). La salud de cartera y operacion-hoy usan datos live.

Indice Nexo (heuristica POC documentada): 100 puntos penalizados por la ratio de
mora del snapshot -> indice = round(100 * (1 - mora_ratio)), con mora_ratio =
prestamos_en_mora / prestamos_vigentes. Cambia cuando cambia el snapshot.
"""

from datetime import date
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.m07_riesgo.metricas import aging, cosechas, perdida_esperada
from app.m07_riesgo.servicio import cartera_riesgo
from app.m10_tesoreria.servicio import cashflow
from app.modelos_stub import (
    Alerta,
    Cuota,
    ParadaRuta,
    Prestamo,
    RutaDiaria,
    SnapshotCartera,
    SolicitudCredito,
)
from nexocred_core import CERO, redondear, sumar


async def ultimo_snapshot(session: AsyncSession) -> SnapshotCartera | None:
    res = await session.execute(
        select(SnapshotCartera).order_by(SnapshotCartera.fecha_corte.desc()).limit(1)
    )
    return res.scalar_one_or_none()


def _indice_nexo(snap: SnapshotCartera) -> Decimal:
    if snap.prestamos_vigentes <= 0:
        return Decimal("100")
    mora_ratio = Decimal(snap.prestamos_en_mora) / Decimal(snap.prestamos_vigentes)
    indice = (Decimal("100") * (Decimal("1") - mora_ratio)).quantize(Decimal("1"))
    return max(Decimal("0"), min(Decimal("100"), indice))


async def resumen(session: AsyncSession) -> dict:
    snap = await ultimo_snapshot(session)
    if snap is None:
        return {
            "tiene_snapshot": False, "periodo": None, "indice_nexo": Decimal("0"),
            "prestamos_vigentes": 0, "prestamos_en_mora": 0,
        }
    return {
        "tiene_snapshot": True,
        "periodo": snap.fecha_corte,
        "indice_nexo": _indice_nexo(snap),
        "prestamos_vigentes": snap.prestamos_vigentes,
        "prestamos_en_mora": snap.prestamos_en_mora,
    }


async def pulso(session: AsyncSession) -> dict:
    snap = await ultimo_snapshot(session)
    if snap is None:
        return {"tiene_snapshot": False, "periodo": None, "tarjetas": []}
    tarjetas = [
        {"clave": "prestamos_vigentes", "etiqueta": "Prestamos vigentes",
         "valor": str(snap.prestamos_vigentes)},
        {"clave": "prestamos_en_mora", "etiqueta": "Prestamos en mora",
         "valor": str(snap.prestamos_en_mora)},
        {"clave": "colocacion_mes", "etiqueta": "Colocacion del mes",
         "valor": f"{redondear(snap.colocacion_mes):.2f}"},
        {"clave": "intereses_cobrados_mes", "etiqueta": "Intereses cobrados",
         "valor": f"{redondear(snap.intereses_cobrados_mes):.2f}"},
        {"clave": "capital_disponible", "etiqueta": "Capital disponible",
         "valor": f"{redondear(snap.capital_disponible):.2f}"},
    ]
    return {"tiene_snapshot": True, "periodo": snap.fecha_corte, "tarjetas": tarjetas}


async def salud_cartera(session: AsyncSession, fecha: date) -> dict:
    snap = await ultimo_snapshot(session)
    cartera = await cartera_riesgo(session, fecha)
    ag = aging(cartera)
    cos = cosechas(cartera)
    cf = await cashflow(session, fecha, 90)
    return {
        "tiene_snapshot": snap is not None,
        "aging": ag,
        "perdida_esperada": perdida_esperada(cartera),
        "cosechas": [
            {"mes": mes, "capital": f"{v['capital']:.2f}", "mora": f"{v['mora']:.2f}",
             "ratio_mora": str(v["ratio_mora"])}
            for mes, v in cos.items()
        ],
        "cashflow": [
            {"dias": t["dias"], "entradas": f"{t['entradas']:.2f}",
             "neto": f"{t['neto']:.2f}"}
            for t in cf["tramos"]
        ],
    }


async def operacion_hoy(session: AsyncSession, fecha: date) -> dict:
    res = await session.execute(
        select(Cuota.cuota, Cuota.capital, Cuota.interes)
        .join(Prestamo, Cuota.prestamo_id == Prestamo.id)
        .where(
            Cuota.vencimiento == fecha,
            Cuota.estado.in_(["pendiente", "parcial"]),
            Prestamo.estado.in_(["vigente", "en_mora"]),
        )
    )
    montos = []
    cuotas_hoy = 0
    for cuota, capital, interes in res.all():
        cuotas_hoy += 1
        montos.append(cuota if cuota is not None else sumar(capital or CERO, interes or CERO))
    cobranza = redondear(sumar(*montos)) if montos else CERO

    rutas = await session.scalar(
        select(func.count()).select_from(RutaDiaria).where(
            RutaDiaria.fecha == fecha, RutaDiaria.estado == "abierta"
        )
    )
    promesas = await session.scalar(
        select(func.count()).select_from(ParadaRuta).where(
            ParadaRuta.resultado == "promesa"
        )
    )
    pipeline = await session.scalar(
        select(func.count()).select_from(SolicitudCredito).where(
            SolicitudCredito.estado.notin_(["aprobada", "rechazada", "desembolsada"])
        )
    )
    return {
        "cobranza_del_dia": cobranza,
        "cuotas_vencen_hoy": cuotas_hoy,
        "rutas_activas": int(rutas or 0),
        "promesas_pendientes": int(promesas or 0),
        "pipeline_solicitudes": int(pipeline or 0),
    }


async def negocio(session: AsyncSession, fecha: date) -> dict:
    snap = await ultimo_snapshot(session)
    inicio_mes = fecha.replace(day=1)
    # top vendedores/productos por colocacion del mes (live)
    res_v = await session.execute(
        select(Prestamo.vendedor_id, func.coalesce(
            func.sum(func.coalesce(Prestamo.monto_desembolsado, Prestamo.capital)), 0))
        .where(Prestamo.fecha_desembolso >= inicio_mes, Prestamo.fecha_desembolso <= fecha)
        .group_by(Prestamo.vendedor_id)
        .order_by(func.coalesce(
            func.sum(func.coalesce(Prestamo.monto_desembolsado, Prestamo.capital)), 0).desc())
        .limit(5)
    )
    top_vend = [
        {"clave": str(v) if v else "sin_vendedor", "valor": redondear(Decimal(m))}
        for v, m in res_v.all()
    ]
    res_p = await session.execute(
        select(Prestamo.producto_id, func.coalesce(
            func.sum(func.coalesce(Prestamo.monto_desembolsado, Prestamo.capital)), 0))
        .where(Prestamo.fecha_desembolso >= inicio_mes, Prestamo.fecha_desembolso <= fecha)
        .group_by(Prestamo.producto_id)
        .order_by(func.coalesce(
            func.sum(func.coalesce(Prestamo.monto_desembolsado, Prestamo.capital)), 0).desc())
        .limit(5)
    )
    top_prod = [
        {"clave": str(p), "valor": redondear(Decimal(m))} for p, m in res_p.all()
    ]
    if snap is None:
        return {
            "tiene_snapshot": False, "colocacion_mes": CERO,
            "intereses_cobrados_mes": CERO, "punitorios_cobrados_mes": CERO,
            "top_vendedores": top_vend, "top_productos": top_prod,
        }
    return {
        "tiene_snapshot": True,
        "colocacion_mes": redondear(snap.colocacion_mes),
        "intereses_cobrados_mes": redondear(snap.intereses_cobrados_mes),
        "punitorios_cobrados_mes": redondear(snap.punitorios_cobrados_mes),
        "top_vendedores": top_vend,
        "top_productos": top_prod,
    }


async def alertas_live(session: AsyncSession) -> dict:
    res = await session.execute(
        select(Alerta).where(Alerta.estado == "activa").order_by(Alerta.created_at.desc())
    )
    alertas = list(res.scalars().all())
    return {
        "total": len(alertas),
        "alertas": [
            {
                "id": str(a.id), "tipo": a.tipo, "severidad": a.severidad,
                "metrica": a.metrica, "valor": a.valor,
                "prestamo_id": str(a.prestamo_id) if a.prestamo_id else None,
                "persona_id": str(a.persona_id) if a.persona_id else None,
            }
            for a in alertas
        ],
    }
