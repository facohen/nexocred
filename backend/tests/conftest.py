import os
import subprocess
from collections.abc import AsyncGenerator
from pathlib import Path

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

# backend/tests/conftest.py -> parents[1] == backend/ (independiente del cwd de invocacion).
BACKEND_DIR = Path(__file__).resolve().parents[1]

# Secreto JWT de test >= 32 bytes para evitar InsecureKeyLengthWarning de PyJWT.
# Se setea antes de importar app.config (la config es un singleton de modulo).
os.environ.setdefault(
    "JWT_SECRET_KEY", "test-secret-key-para-pytest-0123456789-abcdef"
)

ADMIN_URL = "postgresql+asyncpg://nexocred:nexocred@localhost:5432/nexocred"
# Nombre de la DB de test configurable via env (default nexocred_test) para
# permitir correr suites aisladas en paralelo sin colisionar el DROP/CREATE.
TEST_DB = os.environ.get("NEXOCRED_TEST_DB", "nexocred_test")
TEST_URL = f"postgresql+asyncpg://nexocred:nexocred@localhost:5432/{TEST_DB}"
TEST_URL_SYNC = f"postgresql+psycopg://nexocred:nexocred@localhost:5432/{TEST_DB}"


def make_test_engine(**kw) -> AsyncEngine:
    """Crea un engine async de test con NullPool.

    NullPool no mantiene conexiones idle entre usos: cada conexion se cierra al
    devolverse. Esto evita (a) la fuga de conexiones que agotaba max_connections
    de Postgres en la corrida completa, y (b) la reutilizacion de una conexion
    asyncpg ligada a un event loop ya cerrado (cada test de pytest-asyncio corre
    en su propio loop), causa del 'connection was closed in the middle of
    operation'. Todo engine de test debe crearse con este helper.
    """
    return create_async_engine(TEST_URL, poolclass=NullPool, **kw)


@pytest_asyncio.fixture(scope="session")
async def _crear_db_de_test():
    admin = create_async_engine(ADMIN_URL, isolation_level="AUTOCOMMIT")
    async with admin.connect() as conn:
        await conn.execute(text(f"DROP DATABASE IF EXISTS {TEST_DB} WITH (FORCE)"))
        await conn.execute(text(f"CREATE DATABASE {TEST_DB}"))
    await admin.dispose()
    subprocess.run(
        ["alembic", "upgrade", "head"],
        cwd=BACKEND_DIR,
        check=True,
        env={**os.environ, "DATABASE_URL_SYNC": TEST_URL_SYNC},
    )
    yield


@pytest_asyncio.fixture
async def session(_crear_db_de_test) -> AsyncGenerator[AsyncSession, None]:
    engine = make_test_engine()
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as s:
        yield s
        await s.rollback()
    await engine.dispose()


@pytest_asyncio.fixture
async def limpiar_db(_crear_db_de_test) -> AsyncGenerator[None, None]:
    """Trunca todas las tablas de dominio antes de cada test que use el cliente HTTP,
    para aislamiento (el cliente abre su propia sesion via get_session override)."""
    engine = make_test_engine(isolation_level="AUTOCOMMIT")
    tablas = (
        "rendicion_descargo, rendicion, "
        "comision_liquidacion_detalle, comision_liquidacion, "
        "interaccion, asignacion_crm, prospecto, "
        "imputacion, pago, cuota, parada_ruta, ruta_diaria, comision_devengo, "
        "liquidacion_detalle, liquidacion_comision, documento_emitido, "
        "documento_numero, aporte_retiro, "
        "novacion_origen, novacion, "
        "arqueo_caja, movimiento_caja, caja, prestamo, "
        "solicitud_credito, workflow_ejecucion, workflow_regla, "
        "alerta, incidente, tarea, snapshot_cartera, "
        "matriz_tasa, matriz_comision, gasto_originacion, producto_version, "
        "producto_credito, perfil_pricing, "
        "persona_deuda_bcra, persona_marca, persona_referencia, persona, "
        "auditoria_evento, idempotency_key, usuario_rol, usuario, rol"
    )
    async with engine.connect() as conn:
        # Antes de truncar, terminamos cualquier OTRA conexion a la test-DB que
        # haya quedado viva del test anterior (pool del engine de la app sin
        # disponer todavia). Esas conexiones sostienen RowExclusiveLock y hacen
        # que el TRUNCATE (AccessExclusiveLock) entre en deadlock. Cerrarlas
        # primero le da via libre y elimina la causa raiz del deadlock.
        await conn.execute(
            text(
                "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                "WHERE datname = :db AND pid <> pg_backend_pid()"
            ),
            {"db": TEST_DB},
        )
        # lock_timeout como red de seguridad: si aun asi hubiera contencion,
        # falla rapido y diagnosticable en vez de colgar la suite.
        await conn.execute(text("SET lock_timeout = '5s'"))
        await conn.execute(text(f"TRUNCATE {tablas} RESTART IDENTITY CASCADE"))
    await engine.dispose()
    yield


@pytest_asyncio.fixture(autouse=True)
async def _reset_parametros():
    """PARAMETROS_GLOBALES es un singleton en memoria; lo restauramos por test."""
    from app.m12_auth.router import PARAMETROS_GLOBALES

    snapshot = dict(PARAMETROS_GLOBALES)
    yield
    PARAMETROS_GLOBALES.clear()
    PARAMETROS_GLOBALES.update(snapshot)


@pytest_asyncio.fixture
async def app(limpiar_db):
    from app.db import get_session
    from app.main import crear_app

    engine = make_test_engine()
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def _get_session() -> AsyncGenerator[AsyncSession, None]:
        async with maker() as s:
            yield s

    aplicacion = crear_app()
    aplicacion.dependency_overrides[get_session] = _get_session
    yield aplicacion
    await engine.dispose()


@pytest_asyncio.fixture
async def client(app) -> AsyncGenerator[AsyncClient, None]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture
async def roles_seed() -> None:
    """Crea los 6 roles del sistema."""
    from app.m12_auth.modelos import Rol

    engine = make_test_engine()
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as s:
        for nombre in ("admin", "analista", "cobrador", "vendedor", "operador", "tesoreria"):
            existente = await s.execute(
                text("SELECT 1 FROM rol WHERE nombre=:n"), {"n": nombre}
            )
            if existente.scalar() is None:
                s.add(Rol(nombre=nombre))
        await s.commit()
    await engine.dispose()


@pytest_asyncio.fixture
async def usuario_seed(roles_seed) -> dict:
    """Crea un usuario admin con password conocido."""
    from app.m12_auth.servicio import crear_usuario

    engine = make_test_engine()
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as s:
        u = await crear_usuario(
            s,
            email="admin@nexo.test",
            nombre="Admin",
            password="secreto123",
            roles=["admin"],
            actor_id=None,
        )
        await s.commit()
        datos = {"id": str(u.id), "email": u.email}
    await engine.dispose()
    return datos


@pytest_asyncio.fixture
async def admin_token(client, usuario_seed) -> str:
    r = await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@nexo.test", "password": "secreto123"},
    )
    return r.json()["access_token"]


@pytest_asyncio.fixture
async def analista_token(client, roles_seed) -> str:
    from app.m12_auth.servicio import crear_usuario

    engine = make_test_engine()
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as s:
        await crear_usuario(
            s,
            email="analista@nexo.test",
            nombre="Analista",
            password="secreto123",
            roles=["analista"],
            actor_id=None,
        )
        await s.commit()
    await engine.dispose()
    r = await client.post(
        "/api/v1/auth/login",
        json={"email": "analista@nexo.test", "password": "secreto123"},
    )
    return r.json()["access_token"]


@pytest_asyncio.fixture
async def tesoreria_token(client, roles_seed) -> str:
    from app.m12_auth.servicio import crear_usuario

    engine = make_test_engine()
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as s:
        await crear_usuario(
            s,
            email="tesoreria@nexo.test",
            nombre="Tesoreria",
            password="secreto123",
            roles=["tesoreria"],
            actor_id=None,
        )
        await s.commit()
    await engine.dispose()
    r = await client.post(
        "/api/v1/auth/login",
        json={"email": "tesoreria@nexo.test", "password": "secreto123"},
    )
    return r.json()["access_token"]


@pytest_asyncio.fixture
async def cobrador_usuario(client, roles_seed) -> dict:
    """Crea un usuario cobrador y devuelve {'id': ..., 'token': ...}."""
    from app.m12_auth.servicio import crear_usuario

    engine = make_test_engine()
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as s:
        u = await crear_usuario(
            s,
            email="cobrador@nexo.test",
            nombre="Cobrador",
            password="secreto123",
            roles=["cobrador"],
            actor_id=None,
        )
        await s.commit()
        usuario_id = str(u.id)
    await engine.dispose()
    r = await client.post(
        "/api/v1/auth/login",
        json={"email": "cobrador@nexo.test", "password": "secreto123"},
    )
    token = r.json()["access_token"]
    return {"id": usuario_id, "token": token}


@pytest_asyncio.fixture
async def cobrador_token(cobrador_usuario) -> str:
    return cobrador_usuario["token"]
