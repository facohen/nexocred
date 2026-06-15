"""Race de idempotencia in-flight: dos requests concurrentes con la misma
Idempotency-Key deben producir EXACTAMENTE UN set de efectos secundarios e
identica respuesta (true replay), no duplicados.

Antes del fix, el request B (en su propia transaccion) no veia la reserva
uncommitted de A, insertaba la suya, chocaba con la UNIQUE y re-leia
respuesta_json=NULL -> ambos seguian y duplicaban efectos. El fix serializa los
requests de la misma (clave, operacion) mediante un advisory lock transaccional:
B BLOQUEA hasta que A commitea y entonces lee la respuesta ya rellenada (replay).

Los tests fuerzan el interleaving determinista (no dependen del scheduler):
A reserva y retiene su transaccion; B intenta reservar y DEBE bloquear; al
commitear A, B se desbloquea y obtiene la respuesta de A.
"""

import asyncio
import uuid
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.idempotencia import guardar_resultado_idempotente
from app.m04_caja.modelos import Caja
from app.m10_tesoreria.servicio import _crear_aporte_retiro
from app.m12_auth.modelos import Rol, Usuario
from app.m13_documentos.servicio import generar
from tests._seed_f1d import crear_persona, crear_prestamo, crear_producto
from tests.conftest import make_test_engine

pytestmark = pytest.mark.asyncio


def _maker():
    engine = make_test_engine()
    return engine, async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )


async def _seed_prestamo_y_usuario() -> tuple[str, str]:
    engine, maker = _maker()
    async with maker() as s:
        s.add(Rol(nombre="admin_sistema"))
        u = Usuario(email="doc@test.com", nombre="Doc", password_hash="x")
        s.add(u)
        persona = await crear_persona(s)
        producto = await crear_producto(s)
        p = await crear_prestamo(
            s, persona.id, producto.id, capital=Decimal("100000"),
            fecha_desembolso=date(2026, 6, 1),
        )
        await s.commit()
        await s.refresh(u)
        await s.refresh(p)
        res = (str(p.id), str(u.id))
    await engine.dispose()
    return res


async def _seed_caja(saldo: Decimal) -> str:
    engine, maker = _maker()
    async with maker() as s:
        caja = Caja(nombre="Principal", tipo="efectivo", saldo_teorico=saldo)
        s.add(caja)
        await s.commit()
        await s.refresh(caja)
        res = str(caja.id)
    await engine.dispose()
    return res


async def test_primitivo_idempotente_bloquea_in_flight(limpiar_db):
    """Contrato del primitivo: con A reservado (uncommitted), B BLOQUEA al reservar
    la misma (clave, operacion) y solo avanza tras el commit de A, viendo su
    respuesta rellenada (no None)."""
    clave, operacion = "k-race", "op-race"
    eng_a, maker_a = _maker()
    eng_b, maker_b = _maker()
    sa = maker_a()
    try:
        # A reserva y rellena su respuesta, SIN commitear todavia.
        r_a = await guardar_resultado_idempotente(sa, clave, operacion, None)
        assert r_a is None  # primer reservante
        await sa.execute(
            text(
                "UPDATE idempotency_key SET respuesta_json='\"A\"' "
                "WHERE clave=:c AND operacion=:o"
            ),
            {"c": clave, "o": operacion},
        )

        sb = maker_b()
        b_resultado: list = []

        async def _b():
            r_b = await guardar_resultado_idempotente(sb, clave, operacion, None)
            b_resultado.append(r_b)

        tarea_b = asyncio.create_task(_b())
        # Dar tiempo a que B intente y quede BLOQUEADO en el lock de A.
        await asyncio.sleep(0.5)
        assert not tarea_b.done(), "B deberia estar bloqueado hasta el commit de A"

        await sa.commit()
        await asyncio.wait_for(tarea_b, timeout=5)
        # B ve la respuesta rellenada de A (replay), nunca None.
        assert b_resultado == ['"A"']
        await sb.rollback()
        await sb.close()
    finally:
        await sa.close()
        await eng_a.dispose()
        await eng_b.dispose()


async def test_generar_concurrente_no_duplica(limpiar_db):
    prestamo_id, usuario_id = await _seed_prestamo_y_usuario()
    clave = "doc-concurrente-1"

    async def _call():
        engine, maker = _maker()
        async with maker() as s:
            doc = await generar(
                s, tipo="mutuo", prestamo_id=uuid.UUID(prestamo_id),
                actor_id=uuid.UUID(usuario_id), idempotency_key=clave,
            )
            res = (str(doc.id), doc.numero)
        await engine.dispose()
        return res

    r1, r2 = await asyncio.gather(_call(), _call())
    assert r1 == r2

    engine, maker = _maker()
    async with maker() as s:
        n = await s.scalar(text("SELECT count(*) FROM documento_emitido"))
    await engine.dispose()
    assert n == 1


async def test_aporte_concurrente_no_duplica(limpiar_db):
    caja_id = await _seed_caja(Decimal("1000000"))
    clave = "aporte-concurrente-1"

    async def _call():
        engine, maker = _maker()
        async with maker() as s:
            ar = await _crear_aporte_retiro(
                s, tipo="aporte", monto=Decimal("50000"),
                fecha_negocio=date(2026, 6, 1), caja_id=uuid.UUID(caja_id),
                inversor=None, nota=None, actor_id=None, idempotency_key=clave,
            )
            res = str(ar.id)
        await engine.dispose()
        return res

    r1, r2 = await asyncio.gather(_call(), _call())
    assert r1 == r2

    engine, maker = _maker()
    async with maker() as s:
        n_ar = await s.scalar(text("SELECT count(*) FROM aporte_retiro"))
        n_mov = await s.scalar(
            text("SELECT count(*) FROM movimiento_caja WHERE categoria='capital'")
        )
        saldo = await s.scalar(text("SELECT saldo_teorico FROM caja"))
    await engine.dispose()
    assert n_ar == 1
    assert n_mov == 1
    assert saldo == Decimal("1050000.00")
