"""Tests del job generar_snapshot: idempotente por fecha_corte, metricas exactas."""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.jobs.snapshot import generar_snapshot
from app.m04_caja.modelos import Caja
from app.modelos_stub import Cuota, Imputacion, MovimientoCaja, Pago, SnapshotCartera
from tests._seed_f1d import crear_persona, crear_prestamo, crear_producto

pytestmark = pytest.mark.asyncio


async def _seed(session, fecha_corte: date):
    """Cartera determinista:
    - P1: vigente, al dia, desembolsado este mes, capital 100000, 1 cuota futura.
    - P2: en mora, desembolsado mes pasado, capital 50000, 1 cuota vencida.
    - Pago de este mes con imputaciones de interes (5000) y punitorio (3000).
    - Caja con saldo 200000.
    """
    persona = await crear_persona(session)
    producto = await crear_producto(session)
    inicio_mes = fecha_corte.replace(day=1)

    p1 = await crear_prestamo(
        session, persona.id, producto.id, capital=Decimal("100000"),
        fecha_desembolso=inicio_mes + timedelta(days=2),
        monto_desembolsado=Decimal("100000"),
    )
    p2 = await crear_prestamo(
        session, persona.id, producto.id, capital=Decimal("50000"),
        fecha_desembolso=inicio_mes - timedelta(days=40),
        monto_desembolsado=Decimal("50000"),
    )

    session.add(Cuota(
        prestamo_id=p1.id, numero=1, vencimiento=fecha_corte + timedelta(days=30),
        capital=Decimal("100000"), interes=Decimal("10000"), cuota=Decimal("110000"),
        estado="pendiente",
    ))
    session.add(Cuota(
        prestamo_id=p2.id, numero=1, vencimiento=fecha_corte - timedelta(days=10),
        capital=Decimal("50000"), interes=Decimal("5000"), cuota=Decimal("55000"),
        estado="pendiente",
    ))
    await session.flush()

    pago = Pago(
        prestamo_id=p2.id, monto=Decimal("8000"), estado="registrado",
        fecha_negocio=inicio_mes + timedelta(days=5),
    )
    session.add(pago)
    await session.flush()
    session.add_all([
        Imputacion(pago_id=pago.id, concepto="interes_vencido",
                   monto=Decimal("5000"), orden_waterfall=2, cuota_numero=1),
        Imputacion(pago_id=pago.id, concepto="punitorio_vencido",
                   monto=Decimal("3000"), orden_waterfall=1, cuota_numero=1),
    ])

    caja = Caja(nombre="Principal", tipo="efectivo", saldo_teorico=Decimal("200000"))
    session.add(caja)
    await session.flush()
    session.add(MovimientoCaja(
        caja_id=caja.id, tipo="ingreso", monto=Decimal("200000"),
        fecha_negocio=inicio_mes, concepto="apertura",
    ))
    await session.flush()


async def test_orm_tiene_unique_constraint_fecha_corte():
    """El modelo ORM debe declarar la unique constraint que usa el upsert y que
    creo la migracion 0004, para que la metadata coincida con la DB."""
    from sqlalchemy import UniqueConstraint

    constraints = {
        c.name
        for c in SnapshotCartera.__table__.constraints
        if isinstance(c, UniqueConstraint)
    }
    assert "snapshot_cartera_fecha_corte_uq" in constraints
    # fecha_corte NOT NULL (clave del upsert).
    assert SnapshotCartera.__table__.c.fecha_corte.nullable is False


async def test_genera_una_fila_con_metricas(session):
    fecha = date(2026, 6, 11)
    await _seed(session, fecha)
    await session.flush()

    snap = await generar_snapshot(session, fecha, actor_id=None)
    await session.flush()

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
    await session.flush()

    await generar_snapshot(session, fecha, actor_id=None)
    await session.flush()
    await generar_snapshot(session, fecha, actor_id=None)
    await session.flush()

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
    await session.flush()
    s1 = await generar_snapshot(session, fecha, actor_id=None)
    await session.flush()
    v1 = (s1.prestamos_vigentes, s1.intereses_cobrados_mes, s1.capital_disponible)
    s2 = await generar_snapshot(session, fecha, actor_id=None)
    await session.flush()
    v2 = (s2.prestamos_vigentes, s2.intereses_cobrados_mes, s2.capital_disponible)
    assert v1 == v2


async def test_snapshot_es_as_of_fecha_corte_no_fin_de_mes(session):
    """Eventos del MISMO mes pero POSTERIORES a fecha_corte se EXCLUYEN (as-of).

    El snapshot a fecha_corte=2026-06-11 no debe incluir desembolsos ni cobros con
    fecha_negocio 2026-06-12..2026-06-30 (futuro respecto del corte).
    """
    fecha = date(2026, 6, 11)
    await _seed(session, fecha)

    persona = await crear_persona(session)
    producto = await crear_producto(session)

    # Desembolso POSTERIOR al corte pero dentro del mismo mes -> NO debe contar.
    p_futuro = await crear_prestamo(
        session, persona.id, producto.id, capital=Decimal("777777"),
        fecha_desembolso=fecha + timedelta(days=5),
        monto_desembolsado=Decimal("777777"),
    )
    # Pago POSTERIOR al corte pero dentro del mismo mes -> intereses/punitorios NO cuentan.
    pago_futuro = Pago(
        prestamo_id=p_futuro.id, monto=Decimal("99999"), estado="registrado",
        fecha_negocio=fecha + timedelta(days=6),
    )
    session.add(pago_futuro)
    await session.flush()
    session.add_all([
        Imputacion(pago_id=pago_futuro.id, concepto="interes_vencido",
                   monto=Decimal("11111"), orden_waterfall=2, cuota_numero=1),
        Imputacion(pago_id=pago_futuro.id, concepto="punitorio_vencido",
                   monto=Decimal("22222"), orden_waterfall=1, cuota_numero=1),
    ])
    await session.flush()

    snap = await generar_snapshot(session, fecha, actor_id=None)
    await session.flush()

    # Solo los eventos pre-corte del _seed: 100000 colocacion, 5000 interes, 3000 punitorio.
    assert snap.colocacion_mes == Decimal("100000.00")
    assert snap.intereses_cobrados_mes == Decimal("5000.00")
    assert snap.punitorios_cobrados_mes == Decimal("3000.00")
