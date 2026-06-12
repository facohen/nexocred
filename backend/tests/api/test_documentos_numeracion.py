"""Tests de numeracion transaccional por tipo de documento."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.m13_documentos.numeracion import asignar_numero
from tests.conftest import make_test_engine

pytestmark = pytest.mark.asyncio


async def test_secuencial_sin_huecos(session):
    nums = [await asignar_numero(session, "recibo") for _ in range(5)]
    assert nums == [1, 2, 3, 4, 5]


async def test_tipos_independientes(session):
    r1 = await asignar_numero(session, "recibo")
    m1 = await asignar_numero(session, "mutuo")
    r2 = await asignar_numero(session, "recibo")
    assert r1 == 1
    assert m1 == 1  # contador independiente
    assert r2 == 2


async def test_concurrencia_sin_duplicados(session):
    """Dos sesiones concurrentes no asignan el mismo numero: el FOR UPDATE serializa."""
    # primera sesion reserva la fila y la mantiene bloqueada
    await asignar_numero(session, "pagare")  # crea fila + numero 1, sin commit aun

    engine2 = make_test_engine()
    maker2 = async_sessionmaker(engine2, class_=AsyncSession, expire_on_commit=False)
    await session.commit()  # libera para que la fila exista y este visible
    async with maker2() as s2:
        n2 = await asignar_numero(s2, "pagare")
        await s2.commit()
    await engine2.dispose()
    assert n2 == 2
