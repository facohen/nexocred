"""Tests del job generar_snapshot: idempotente por fecha_corte, metricas exactas."""

import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.jobs.snapshot import generar_snapshot
from app.m04_caja.modelos import Caja
from app.modelos_stub import (
    Cuota,
    Imputacion,
    MovimientoCaja,
    Pago,
    Prestamo,
    SnapshotCartera,
)

pytestmark = pytest.mark.asyncio


async def _persona(session):
    pid = uuid.uuid4()
    await session.execute(
        Prestamo.__table__.metadata.tables["persona"].insert().values(
            id=pid, nombre_razon_social="Cliente", tipo_persona="fisica",
        )
    )
    return pid


async def _producto(session):
    prod = uuid.uuid4()
    await session.execute(
        Prestamo.__table__.metadata.tables["producto_credito"].insert().values(
            id=prod, nombre="Producto", activo=True,
        )
    )
    return prod


async def _seed(session, fecha_corte: date):
    """Cartera sembrada determinista:
    - P1: vigente, al dia, desembolsado este mes, capital 100000, 1 cuota futura.
    - P2: en mora, desembolsado mes pasado, capital 50000, 1 cuota vencida.
    - Pago con imputaciones de interes y punitorio este mes.
    - Caja con saldo 200000.
    """
    persona = await _persona(session)
    producto = await _producto(session)
    inicio_mes = fecha_corte.replace(day=1)

    p1 = Prestamo(
        id=uuid.uuid4(), persona_id=persona, producto_id=producto,
        capital=Decimal("100000"), estado="vigente",
        fecha_desembolso=inicio_mes + timedelta(days=2),
        monto_desembolsado=Decimal("100000"),
        tasa_punitorio_diario=Decimal("0.001"),
    )
    p2 = Prestamo(
        id=uuid.uuid4(), persona_id=persona, producto_id=producto,
        capital=Decimal("50000"), estado="vigente",
        fecha_desembolso=inicio_mes - timedelta(days=40),
        monto_desembolsado=Decimal("50000"),
        tasa_punitorio_diario=Decimal("0.001"),
    )
    session.add_all([p1, p2])
    await session.flush()

    # P1: cuota futura (no vencida) -> al dia
    session.add(Cuota(
        prestamo_id=p1.id, numero=1, vencimiento=fecha_corte + timedelta(days=30),
        capital=Decimal("100000"), interes=Decimal("10000"), cuota=Decimal("110000"),
        estado="pendiente",
    ))
    # P2: cuota vencida -> en mora
    session.add(Cuota(
        prestamo_id=p2.id, numero=1, vencimiento=fecha_corte - timedelta(days=10),
        capital=Decimal("50000"), interes=Decimal("5000"), cuota=Decimal("55000"),
        estado="vencida",
    ))
    await session.flush()

    # Pago de este mes con imputaciones de interes + punitorio
    pago = Pago(
        prestamo_id=p2.id, monto=Decimal("8000"), estado="registrado",
        fecha_negocio=inicio_mes + timedelta(days=5),
    )
    session.add(pago)
    await session.flush()
    session.add_all([
        Imputacion(pago_id=pago.id, concepto="interes_vencido", monto=Decimal("5000")),
        Imputacion(pago_id=pago.id, concepto="punitorio_vencido", monto=Decimal("3000")),
    ])

    caja = Caja(nombre="Principal", tipo="efectivo", saldo_teorico=Decimal("200000"))
    session.add(caja)
    await session.flush()
    session.add(MovimientoCaja(
        caja_id=caja.id, tipo="ingreso", monto=Decimal("200000"),
        fecha_negocio=inicio_mes, concepto="apertura",
    ))
    await session.flush()
    return persona, producto


async def test_genera_una_fila_con_metricas(session):
    fecha = date(2026, 6, 11)
    await _seed(session, fecha)
    await session.commit()

    snap = await generar_snapshot(session, fecha, actor_id=None)
    await session.commit()

    assert snap.fecha_corte == fecha
    assert snap.prestamos_vigentes == 2
    assert snap.prestamos_en_mora == 1
    assert snap.colocacion_mes == Decimal("100000.00")
    assert snap.intereses_cobrados_mes == Decimal("5000.00")
    assert snap.punitorios_cobrados_mes == Decimal("3000.00")
    assert snap.capital_disponible == Decimal("200000.00")


async def test_idempotente_misma_fecha(session):
    fecha = date(2026, 6, 11)
    await _seed(session, fecha)
    await session.commit()

    await generar_snapshot(session, fecha, actor_id=None)
    await session.commit()
    await generar_snapshot(session, fecha, actor_id=None)
    await session.commit()

    res = await session.execute(
        select(SnapshotCartera).where(SnapshotCartera.fecha_corte == fecha)
    )
    filas = res.scalars().all()
    assert len(filas) == 1
    assert filas[0].colocacion_mes == Decimal("100000.00")
    assert filas[0].prestamos_vigentes == 2


async def test_metricas_estables_en_rerun(session):
    fecha = date(2026, 6, 11)
    await _seed(session, fecha)
    await session.commit()
    s1 = await generar_snapshot(session, fecha, actor_id=None)
    await session.commit()
    v1 = (s1.prestamos_vigentes, s1.intereses_cobrados_mes, s1.capital_disponible)
    s2 = await generar_snapshot(session, fecha, actor_id=None)
    await session.commit()
    v2 = (s2.prestamos_vigentes, s2.intereses_cobrados_mes, s2.capital_disponible)
    assert v1 == v2
