# F1a — Backend Base + M12 mínimo + M15 + M01 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the persistent backend foundation (app factory, async DB, Alembic schema, idempotency store) plus the first usable APIs — M12 minimum (auth JWT + RBAC + auditoría), M15 (catálogo/perfiles/matrices/simuladores over `nexocred_core`), and M01 (personas/referencias/marcas/BCRA) — with tests running against the docker-compose Postgres 18.

**Architecture:** FastAPI app factory wires an async SQLAlchemy engine (`asyncpg`) and `/api/v1` routers. SQLAlchemy 2 declarative models map the spec §2 DDL; Alembic owns one initial migration that creates every base table plus repaired-spec deltas, BRIN/GIN indexes (spec §4), and the idempotency-key store. Each module (`m12_auth`, `m15_catalogo`, `m01_personas`, `bcra`) is a vertical slice: models + schemas (Pydantic) + service + router + tests. Money crosses the boundary as `Decimal` in Python and `string` (2 decimals) in JSON; financial math is delegated to `nexocred_core`, never re-implemented.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2 async, asyncpg, Alembic (sync via psycopg), Pydantic v2, PyJWT, passlib[bcrypt], pytest, pytest-asyncio, httpx. Run everything in the `nexocred` conda env; Postgres 18 from `docker compose`.

---

## Execution Environment (read first — applies to every task)

- **Always** run python/pytest/ruff/pyright/alembic through the conda env: `conda run -n nexocred <cmd>`. Plain `python` is the wrong interpreter.
- **Postgres must be up** before DB/API tests: `docker compose up -d db` (already configured: `postgres:18`, db/user/pass all `nexocred`, port 5432).
- **Git commits** use inline identity: `git -c user.name="NexoCred Dev" -c user.email="c.federico@gmail.com" commit -m "..."`.
- **Test DB**: tests connect to a dedicated database `nexocred_test` on the same server. A session fixture creates it (via the default `nexocred` db) and runs Alembic `upgrade head` against it; each test runs in a transaction rolled back at teardown.
- **Import roots**: `pythonpath=["backend"]`, so `from app... import ...`, `from nexocred_core import ...`.
- **Language**: business names in Spanish (tables, columns, enums, roles, endpoints, domain field names, UI/error messages); technical English allowed (`test`, `endpoint`, `payload`, `Idempotency-Key`, `created_at`, `worker`, `job`).

---

## File Structure

```
backend/app/
  main.py                 # MODIFY: crear_app() mounts /api/v1 router + lifespan
  config.py               # MODIFY: add database_url, jwt_secret_key, jwt fields, bcra_vigencia_dias
  db.py                   # CREATE: async engine, async_session_maker, get_session dependency, Base
  api.py                  # CREATE: api_v1 APIRouter aggregating module routers
  errors.py               # CREATE: error envelope { error: {code,message,details} } + handlers
  deps.py                 # CREATE: get_session, get_current_user, requiere_rol(...) RBAC deps
  idempotencia.py         # CREATE: IdempotencyKey model + helper to dedupe POST operations
  modelos_base.py         # CREATE: TimestampMixin, UUID pk default, common column types
  auditoria.py            # CREATE: AuditoriaEvento model + escribir_evento() writer
  m12_auth/
    modelos.py            # Usuario, Rol, usuario_rol assoc
    schemas.py            # LoginIn, TokenOut, UsuarioOut, UsuarioCreate
    seguridad.py          # hash_password, verificar_password, crear_token, decodificar_token
    servicio.py           # autenticar, crear_usuario, asignar_roles
    router.py             # /auth/*, /usuarios/*, /auditoria, /parametros
  m15_catalogo/
    modelos.py            # ProductoCredito, ProductoVersion, GastoOriginacion, PerfilPricing, MatrizTasa, MatrizComision
    schemas.py            # ProductoOut/In, SimuladorIn/Out, MatrizIn/Out
    servicio.py           # crear_producto, publicar, simular (delegates to nexocred_core)
    router.py             # /productos/*, /perfiles-pricing, /matrices/*, /simulador/*
  m01_personas/
    modelos.py            # Persona, PersonaReferencia, PersonaMarca, PersonaDeudaBcra
    schemas.py            # PersonaCreate/Out, ReferenciaIn, MarcaIn, DeudaBcraOut
    cuil.py               # validar_cuil (módulo 11)
    servicio.py           # crear_persona, buscar, agregar_referencia, agregar_marca
    router.py             # /personas/*
  bcra/
    puerto.py             # BcraClient protocol, DeudaBcraNormalizada
    fake.py               # FakeBcraClient (dev/test)
    http.py               # HttpBcraClient (stub raising NotImplementedError until real integration)
    servicio.py           # sincronizar_bcra(persona_id) -> persists normalized rows
    router.py             # /bcra/*  + wires /personas/{id}/deuda-bcra/sync
backend/alembic/
  env.py                  # CREATE: async-aware Alembic env reading Base.metadata
  script.py.mako          # CREATE: standard template
  versions/0001_inicial.py# CREATE: full base schema + deltas + indexes + idempotency + auditoria
backend/alembic.ini       # CREATE
backend/tests/
  conftest.py             # CREATE: event_loop, test engine, db setup, client, auth fixtures
  db/test_migracion.py
  db/test_idempotencia.py
  api/test_auth.py
  api/test_rbac.py
  api/test_usuarios.py
  api/test_auditoria.py
  services/test_cuil.py
  api/test_personas.py
  api/test_personas_referencias_marcas.py
  api/test_bcra.py
  api/test_catalogo_productos.py
  api/test_matrices.py
  api/test_simuladores.py
```

---

## Task 1: Config, async DB, Base, error envelope

**Files:**
- Modify: `backend/app/config.py`
- Create: `backend/app/db.py`, `backend/app/modelos_base.py`, `backend/app/errors.py`
- Test: `backend/tests/db/__init__.py`, `backend/tests/api/__init__.py`, `backend/tests/services/__init__.py`, `backend/tests/db/test_db_smoke.py`

- [ ] **Step 1: Write failing smoke test for DB connectivity**

Create the three `__init__.py` (empty) and `backend/tests/db/test_db_smoke.py`:

```python
import pytest
from sqlalchemy import text

from app.db import async_session_maker


@pytest.mark.asyncio
async def test_puede_conectar_a_postgres():
    async with async_session_maker() as session:
        result = await session.execute(text("SELECT 1"))
        assert result.scalar() == 1
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `conda run -n nexocred python -m pytest backend/tests/db/test_db_smoke.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.db'`.

- [ ] **Step 3: Extend config**

Replace `backend/app/config.py`:

```python
from pydantic_settings import BaseSettings, SettingsConfigDict


class Configuracion(BaseSettings):
    ambiente: str = "local"
    database_url: str = "postgresql+asyncpg://nexocred:nexocred@localhost:5432/nexocred"
    jwt_secret_key: str = "change-me-in-local-env"
    jwt_algoritmo: str = "HS256"
    jwt_access_minutos: int = 30
    jwt_refresh_dias: int = 7
    bcra_vigencia_dias: int = 30

    model_config = SettingsConfigDict(env_file=".env", env_prefix="", extra="ignore")


configuracion = Configuracion()
```

Note: `env_prefix=""` so `DATABASE_URL`, `JWT_SECRET_KEY` map directly (compose already sets these). `ambiente` reads `AMBIENTE`; keep `NEXOCRED_AMBIENTE` working by also accepting it — set it explicitly in code paths that need `ambiente`, default `local` is fine.

- [ ] **Step 4: Create the declarative base + mixins**

Create `backend/app/modelos_base.py`:

```python
import uuid
from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


def uuid_pk() -> Mapped[uuid.UUID]:
    # uuidv7 nativo en Postgres 18; default generado en DB via server_default en la migracion.
    return mapped_column(primary_key=True, default=uuid.uuid4)
```

- [ ] **Step 5: Create async DB module**

Create `backend/app/db.py`:

```python
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import configuracion
from app.modelos_base import Base

engine = create_async_engine(configuracion.database_url, echo=False, pool_pre_ping=True)
async_session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_maker() as session:
        yield session


__all__ = ["Base", "engine", "async_session_maker", "get_session"]
```

- [ ] **Step 6: Create the error envelope**

Create `backend/app/errors.py`:

```python
from fastapi import Request
from fastapi.responses import JSONResponse


class ErrorAPI(Exception):
    def __init__(self, code: str, message: str, status: int = 400, details: dict | None = None):
        self.code = code
        self.message = message
        self.status = status
        self.details = details or {}


def sobre_error(code: str, message: str, details: dict | None = None) -> dict:
    return {"error": {"code": code, "message": message, "details": details or {}}}


async def manejar_error_api(request: Request, exc: ErrorAPI) -> JSONResponse:
    return JSONResponse(status_code=exc.status, content=sobre_error(exc.code, exc.message, exc.details))
```

- [ ] **Step 7: Ensure Postgres is up and run the smoke test**

Run: `docker compose up -d db && sleep 3 && conda run -n nexocred python -m pytest backend/tests/db/test_db_smoke.py -v`
Expected: PASS. (If pytest-asyncio needs config, add to `pyproject.toml` `[tool.pytest.ini_options]`: `asyncio_mode = "auto"`.)

- [ ] **Step 8: Set asyncio_mode and re-run full suite**

Add to `pyproject.toml` under `[tool.pytest.ini_options]`: `asyncio_mode = "auto"`. Then run `conda run -n nexocred python -m pytest -q`.
Expected: PASS (core 69 + entorno 3 + db smoke).

- [ ] **Step 9: Commit**

```bash
git add backend/app/config.py backend/app/db.py backend/app/modelos_base.py backend/app/errors.py backend/tests/db backend/tests/api/__init__.py backend/tests/services/__init__.py pyproject.toml
git -c user.name="NexoCred Dev" -c user.email="c.federico@gmail.com" commit -m "feat(backend): config, async DB engine, Base, error envelope"
```

---

## Task 2: SQLAlchemy models for the full schema

Define every model mapping spec §2 DDL plus the base tables referenced as FK targets (§2.1 contract): `usuario`, `rol`, `persona`(+referencia/marca/deuda_bcra), `producto_credito`, `producto_version`, `gasto_originacion`, `perfil_pricing`, `matriz_tasa`, `matriz_comision`, `auditoria_evento`, `idempotency_key`, and stub tables needed as FK targets for later stages but created now (`prestamo`, `movimiento_caja`, `solicitud_credito`, `cuota`, `pago`, `imputacion`, `ruta_diaria`, `parada_ruta`, `comision_devengo`, `snapshot_cartera`, `tarea`, `incidente`, `alerta`, `workflow_regla`, `workflow_ejecucion`, `documento_emitido`, `liquidacion_comision`, `liquidacion_detalle`). Stubs get only the columns spec §2 declares; later stages extend via new migrations.

**Files:**
- Create: module `modelos.py` files under each package + `backend/app/auditoria.py` + `backend/app/idempotencia.py`
- Test: `backend/tests/db/test_modelos_importan.py`

- [ ] **Step 1: Write a failing test that imports all model metadata**

Create `backend/tests/db/test_modelos_importan.py`:

```python
from app.db import Base
from app.registro_modelos import cargar_todos_los_modelos


def test_todas_las_tablas_registradas():
    cargar_todos_los_modelos()
    tablas = set(Base.metadata.tables.keys())
    esperadas = {
        "usuario", "rol", "usuario_rol",
        "persona", "persona_referencia", "persona_marca", "persona_deuda_bcra",
        "producto_credito", "producto_version", "gasto_originacion",
        "perfil_pricing", "matriz_tasa", "matriz_comision",
        "auditoria_evento", "idempotency_key",
        "solicitud_credito", "prestamo", "cuota", "pago", "imputacion",
        "movimiento_caja", "ruta_diaria", "parada_ruta", "comision_devengo",
        "snapshot_cartera", "tarea", "incidente", "alerta",
        "workflow_regla", "workflow_ejecucion", "documento_emitido",
        "liquidacion_comision", "liquidacion_detalle",
    }
    faltantes = esperadas - tablas
    assert not faltantes, f"faltan tablas: {faltantes}"
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `conda run -n nexocred python -m pytest backend/tests/db/test_modelos_importan.py -v`
Expected: FAIL — `ModuleNotFoundError: app.registro_modelos`.

- [ ] **Step 3: Implement the models**

Create the model classes. Implement `persona`, `persona_referencia`, `persona_marca`, `persona_deuda_bcra`, the M15 catalog tables, `usuario`/`rol`/`usuario_rol`, `auditoria_evento`, `idempotency_key` with full columns per spec §2 and §5.8; create the remaining tables as minimal stubs (UUID pk, the FK columns spec §2 explicitly declares, `created_at`). Use `NUMERIC(14,2)` for money, `NUMERIC(10,4)`/`(16,2)` per spec, `CHAR(11)` for cuil, `JSONB` for `redes_sociales`/`condicion_json`/`accion_params`, and `CheckConstraint` for the enum/`situacion`/`tipo` checks spec declares.

Key files (representative — implement all):

`backend/app/m01_personas/modelos.py`:
```python
import uuid

from sqlalchemy import CHAR, CheckConstraint, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.modelos_base import Base, TimestampMixin, uuid_pk


class Persona(Base, TimestampMixin):
    __tablename__ = "persona"
    id: Mapped[uuid.UUID] = uuid_pk()
    apellido: Mapped[str] = mapped_column(Text, nullable=False)
    nombre: Mapped[str] = mapped_column(Text, nullable=False)
    dni: Mapped[str] = mapped_column(Text, nullable=False)
    cuil: Mapped[str] = mapped_column(CHAR(11), nullable=False, unique=True)
    # ... fecha_nac, estado_civil, email, telefono, domicilio_*, tipo_vivienda,
    #     ingresos_* (Numeric(14,2)), empleador/cuit_empleador/fecha_ingreso_laboral,
    #     referido_por_id FK persona.id, redes_sociales JSONB, activo
    __table_args__ = (
        CheckConstraint(
            "estado_civil IN ('soltero','casado','divorciado','viudo','union_convivencial')",
            name="persona_estado_civil_check",
        ),
        CheckConstraint(
            "tipo_vivienda IN ('propia','alquilada','familiar','prestada')",
            name="persona_tipo_vivienda_check",
        ),
    )
```

`backend/app/idempotencia.py`:
```python
import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.modelos_base import Base, uuid_pk


class IdempotencyKey(Base):
    __tablename__ = "idempotency_key"
    id: Mapped[uuid.UUID] = uuid_pk()
    clave: Mapped[str] = mapped_column(String(255), nullable=False)
    operacion: Mapped[str] = mapped_column(String(100), nullable=False)
    respuesta_json: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    __table_args__ = (UniqueConstraint("clave", "operacion", name="idempotency_clave_op_uq"),)
```

`backend/app/auditoria.py`:
```python
import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from app.modelos_base import Base, uuid_pk


class AuditoriaEvento(Base):
    __tablename__ = "auditoria_evento"
    id: Mapped[uuid.UUID] = uuid_pk()
    actor_id: Mapped[uuid.UUID | None] = mapped_column()
    accion: Mapped[str] = mapped_column(String(100), nullable=False)
    entidad: Mapped[str] = mapped_column(String(100), nullable=False)
    entidad_id: Mapped[str | None] = mapped_column(String(64))
    resultado: Mapped[str] = mapped_column(String(20), nullable=False)
    ip: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(Text)
    metadata_json: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


async def escribir_evento(
    session: AsyncSession, *, actor_id, accion, entidad, entidad_id=None,
    resultado="ok", ip=None, user_agent=None, metadata_json=None,
) -> None:
    session.add(AuditoriaEvento(
        actor_id=actor_id, accion=accion, entidad=entidad,
        entidad_id=str(entidad_id) if entidad_id else None, resultado=resultado,
        ip=ip, user_agent=user_agent, metadata_json=metadata_json,
    ))
```

Create `backend/app/registro_modelos.py` that imports every model module so `Base.metadata` is fully populated:
```python
def cargar_todos_los_modelos() -> None:
    from app import auditoria, idempotencia  # noqa: F401
    from app.m01_personas import modelos as _m01  # noqa: F401
    from app.m12_auth import modelos as _m12  # noqa: F401
    from app.m15_catalogo import modelos as _m15  # noqa: F401
    from app import modelos_stub  # noqa: F401
```

Create `backend/app/modelos_stub.py` with the FK-target stub tables (minimal columns).

- [ ] **Step 4: Run the test, confirm green**

Run: `conda run -n nexocred python -m pytest backend/tests/db/test_modelos_importan.py -v`
Expected: PASS — all expected tables registered.

- [ ] **Step 5: Lint + typecheck + commit**

Run: `conda run -n nexocred ruff check backend/app && conda run -n nexocred pyright backend/app`
Then commit:
```bash
git add backend/app backend/tests/db/test_modelos_importan.py
git -c user.name="NexoCred Dev" -c user.email="c.federico@gmail.com" commit -m "feat(backend): modelos SQLAlchemy de schema completo + stubs FK"
```

---

## Task 3: Alembic initial migration (full schema + indexes + deltas)

**Files:**
- Create: `backend/alembic.ini`, `backend/alembic/env.py`, `backend/alembic/script.py.mako`, `backend/alembic/versions/0001_inicial.py`
- Test: `backend/tests/conftest.py`, `backend/tests/db/test_migracion.py`

- [ ] **Step 1: Write conftest that builds the test DB via Alembic**

Create `backend/tests/conftest.py`:

```python
import asyncio
import subprocess

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

ADMIN_URL = "postgresql+asyncpg://nexocred:nexocred@localhost:5432/nexocred"
TEST_DB = "nexocred_test"
TEST_URL = f"postgresql+asyncpg://nexocred:nexocred@localhost:5432/{TEST_DB}"


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session")
async def _crear_db_de_test():
    admin = create_async_engine(ADMIN_URL, isolation_level="AUTOCOMMIT")
    async with admin.connect() as conn:
        await conn.execute(text(f"DROP DATABASE IF EXISTS {TEST_DB} WITH (FORCE)"))
        await conn.execute(text(f"CREATE DATABASE {TEST_DB}"))
    await admin.dispose()
    # correr migraciones contra la DB de test (alembic usa psycopg sync)
    subprocess.run(
        ["alembic", "upgrade", "head"],
        cwd="backend",
        check=True,
        env={"DATABASE_URL_SYNC": f"postgresql+psycopg://nexocred:nexocred@localhost:5432/{TEST_DB}"},
    )
    yield


@pytest_asyncio.fixture
async def session(_crear_db_de_test) -> AsyncSession:
    engine = create_async_engine(TEST_URL)
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as s:
        yield s
        await s.rollback()
    await engine.dispose()
```

Note: `subprocess.run` needs the parent env merged; use `env={**os.environ, "DATABASE_URL_SYNC": ...}`. Add `import os`.

- [ ] **Step 2: Write the migration test (fails first)**

Create `backend/tests/db/test_migracion.py`:

```python
from sqlalchemy import inspect, text


async def test_upgrade_crea_tablas_clave(session):
    res = await session.execute(
        text("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")
    )
    tablas = {r[0] for r in res}
    for t in ["persona", "usuario", "rol", "producto_credito", "auditoria_evento", "idempotency_key"]:
        assert t in tablas


async def test_persona_cuil_es_unico(session):
    from sqlalchemy.exc import IntegrityError
    await session.execute(text(
        "INSERT INTO persona (apellido,nombre,dni,cuil,fecha_nac,estado_civil,email,telefono,"
        "domicilio_calle,domicilio_localidad,domicilio_provincia,tipo_vivienda,"
        "ingresos_declarados,ingresos_en_blanco,ingresos_totales) VALUES "
        "('A','B','111','20111111119','2000-01-01','soltero','a@b.c','123',"
        "'Calle','Loc','BA','propia',100,0,100)"
    ))
    await session.commit()
    try:
        await session.execute(text(
            "INSERT INTO persona (apellido,nombre,dni,cuil,fecha_nac,estado_civil,email,telefono,"
            "domicilio_calle,domicilio_localidad,domicilio_provincia,tipo_vivienda,"
            "ingresos_declarados,ingresos_en_blanco,ingresos_totales) VALUES "
            "('C','D','222','20111111119','2000-01-01','soltero','c@d.e','456',"
            "'Calle','Loc','BA','propia',100,0,100)"
        ))
        await session.commit()
        raised = False
    except IntegrityError:
        raised = True
    assert raised
```

- [ ] **Step 3: Run it, confirm it fails**

Run: `conda run -n nexocred python -m pytest backend/tests/db/test_migracion.py -v`
Expected: FAIL — Alembic not configured / `alembic` command missing config.

- [ ] **Step 4: Create alembic.ini, env.py, template**

Create `backend/alembic.ini` (standard, `script_location = alembic`, `sqlalchemy.url` overridden in env). Create `backend/alembic/env.py` that:
- reads `DATABASE_URL_SYNC` env var (psycopg sync URL) for migrations,
- calls `cargar_todos_los_modelos()` then sets `target_metadata = Base.metadata`,
- runs migrations online with that URL.

Create `backend/alembic/script.py.mako` (standard Alembic template).

- [ ] **Step 5: Author the initial migration `0001_inicial.py`**

Hand-author (do NOT autogenerate — Postgres-specific DDL like `uuidv7()` default, BRIN/GIN, CHECK constraints need explicit control). The migration must:
- `op.execute("CREATE EXTENSION IF NOT EXISTS pg_uuidv7")` guarded for <18, else rely on native `uuidv7()`. For Postgres 18, set column server default `server_default=sa.text("uuidv7()")` on every UUID pk.
- Create all tables from Task 2 with the exact columns/constraints spec §2 declares.
- Apply spec §2 deltas (snapshot_cartera extra columns) and the `documento_emitido` UNIQUE(tipo,numero), `liquidacion_*`, `parada_ruta`, `workflow_*` tables.
- Create indexes: `persona_cuil_idx`, `persona_nombre_idx`(apellido,nombre), `persona_dni_idx`, `persona_deuda_bcra_persona_idx`; **GIN** index on persona name search (`op.execute` with `gin (to_tsvector('spanish', apellido || ' ' || nombre))` or `pg_trgm`); **BRIN** on `created_at` for `pago`, `imputacion`, `movimiento_caja`, `comision_devengo` (`op.execute("CREATE INDEX ... USING brin (created_at)")`).
- Document each inferred stub table in a comment block at the top, per spec §2.1.

- [ ] **Step 6: Run migration tests, confirm green**

Run: `docker compose up -d db && conda run -n nexocred python -m pytest backend/tests/db/test_migracion.py -v`
Expected: PASS — tables exist, cuil uniqueness enforced.

- [ ] **Step 7: Verify upgrade on a clean DB (acceptance gate)**

Run: `cd backend && DATABASE_URL_SYNC=postgresql+psycopg://nexocred:nexocred@localhost:5432/nexocred conda run -n nexocred alembic upgrade head && conda run -n nexocred alembic downgrade base`
Expected: upgrade and downgrade both succeed without error.

- [ ] **Step 8: Commit**

```bash
git add backend/alembic.ini backend/alembic backend/tests/conftest.py backend/tests/db/test_migracion.py
git -c user.name="NexoCred Dev" -c user.email="c.federico@gmail.com" commit -m "feat(backend): migracion inicial Alembic con schema completo, BRIN/GIN, idempotency, auditoria"
```

---

## Task 4: M12 — security primitives + auth endpoints

**Files:**
- Create: `backend/app/m12_auth/{seguridad.py,schemas.py,servicio.py,router.py}`, `backend/app/deps.py`
- Modify: `backend/app/main.py`, `backend/app/api.py`
- Test: `backend/tests/api/test_auth.py`

- [ ] **Step 1: Write failing auth tests**

Create `backend/tests/api/test_auth.py` covering: login with valid creds → 200 + access/refresh tokens; login with bad password → 401 + error envelope; `/auth/refresh` issues new access; protected route without token → 401. Use an httpx `AsyncClient` against the app with the test DB session override, and a fixture that seeds one `usuario` with a known password via `crear_usuario`.

```python
import pytest

pytestmark = pytest.mark.asyncio


async def test_login_ok_devuelve_tokens(client, usuario_seed):
    r = await client.post("/api/v1/auth/login", json={"email": "admin@nexo.test", "password": "secreto123"})
    assert r.status_code == 200
    body = r.json()
    assert "access_token" in body and "refresh_token" in body


async def test_login_password_invalida_401(client, usuario_seed):
    r = await client.post("/api/v1/auth/login", json={"email": "admin@nexo.test", "password": "malo"})
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "credenciales_invalidas"


async def test_ruta_protegida_sin_token_401(client):
    r = await client.get("/api/v1/usuarios")
    assert r.status_code == 401
```

- [ ] **Step 2: Run, confirm fail**

Run: `conda run -n nexocred python -m pytest backend/tests/api/test_auth.py -v`
Expected: FAIL — routes/fixtures absent.

- [ ] **Step 3: Implement `seguridad.py`**

`hash_password`/`verificar_password` via passlib bcrypt; `crear_access_token`/`crear_refresh_token`/`decodificar_token` via PyJWT with `configuracion.jwt_*`. Include `sub` (user id), `roles`, `type` (access|refresh), `exp`.

- [ ] **Step 4: Implement schemas, servicio, router, deps**

`servicio.autenticar(session,email,password)` → user or None; `crear_usuario(session, ...)` hashes password, assigns roles; `asignar_roles`. `deps.get_current_user` decodes Bearer token, loads user, raises `ErrorAPI("no_autenticado",401)` on failure. `deps.requiere_rol(*roles)` returns a dependency raising `ErrorAPI("prohibido",403)` if user lacks role. Router exposes `/auth/login`, `/auth/logout`, `/auth/refresh`, `/usuarios` (CRUD, admin-only), `/auditoria` (admin), `/parametros` (GET all, PATCH admin). Write a login/logout/refresh failed-login audit event via `escribir_evento` (spec §5.8).

- [ ] **Step 5: Wire app factory + api router**

`backend/app/api.py` aggregates module routers under `/api/v1`. `main.py` `crear_app()` includes it, registers the `ErrorAPI` exception handler, keeps `/healthcheck`. Add the `client`/`usuario_seed` fixtures to `conftest.py` (httpx AsyncClient with dependency override of `get_session` to the test session; seed admin user + roles `admin`,`analista`,`cobrador`,`vendedor`,`operador`,`tesoreria`).

- [ ] **Step 6: Run, confirm green; lint; commit**

Run: `conda run -n nexocred python -m pytest backend/tests/api/test_auth.py -v` → PASS.
```bash
git add backend/app backend/tests/conftest.py backend/tests/api/test_auth.py
git -c user.name="NexoCred Dev" -c user.email="c.federico@gmail.com" commit -m "feat(m12): seguridad JWT, login/logout/refresh, app factory + /api/v1"
```

---

## Task 5: M12 — RBAC, usuarios CRUD, auditoría endpoint

**Files:** `backend/app/m12_auth/{servicio.py,router.py}`, `backend/app/deps.py`
**Test:** `backend/tests/api/test_rbac.py`, `backend/tests/api/test_usuarios.py`, `backend/tests/api/test_auditoria.py`

- [ ] **Step 1: Write failing RBAC tests** — analista token blocked from `POST /usuarios` (403), admin allowed (201); user create/list/patch/deactivate happy paths; every sensitive action writes an `auditoria_evento` row (assert count). Include the actual test code asserting `403`/`201` and that `GET /api/v1/auditoria` (admin) returns the events.
- [ ] **Step 2: Run, confirm fail.** `conda run -n nexocred python -m pytest backend/tests/api/test_rbac.py backend/tests/api/test_usuarios.py backend/tests/api/test_auditoria.py -v`
- [ ] **Step 3: Implement** the CRUD + RBAC dependency enforcement + audit writes for user create/deactivate/role-change and parameter changes (spec §5.8).
- [ ] **Step 4: Run, confirm green.**
- [ ] **Step 5: Commit** `feat(m12): RBAC, usuarios CRUD, auditoria endpoint`.

---

## Task 6: M01 — CUIL validation (pure)

**Files:** `backend/app/m01_personas/cuil.py`
**Test:** `backend/tests/services/test_cuil.py`

- [ ] **Step 1: Write failing tests** for módulo-11 check-digit validation:

```python
from app.m01_personas.cuil import validar_cuil


def test_cuil_valido():
    assert validar_cuil("20123456783") is True  # use a known-valid CUIL for the fixture digit


def test_cuil_digito_verificador_incorrecto():
    assert validar_cuil("20123456780") is False


def test_cuil_longitud_invalida():
    assert validar_cuil("123") is False


def test_cuil_no_numerico():
    assert validar_cuil("20-12345678-3") is False
```

(Compute the correct check digit in the test fixtures from the módulo-11 algorithm so the "valid" example is genuinely valid.)

- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement** `validar_cuil` with weights `[5,4,3,2,7,6,5,4,3,2]` over the first 10 digits, `dv = 11 - (sum % 11)`, with the `11→0` / `10→` special handling, comparing against the 11th digit.
- [ ] **Step 4: Run, confirm green.**
- [ ] **Step 5: Commit** `feat(m01): validacion de CUIL modulo 11`.

---

## Task 7: M01 — personas alta/búsqueda/ficha

**Files:** `backend/app/m01_personas/{schemas.py,servicio.py,router.py}`
**Test:** `backend/tests/api/test_personas.py`

- [ ] **Step 1: Write failing tests**: create persona with full ficha → 201; missing required field (e.g. no `ingresos_totales`) → 422; invalid CUIL → 422 with `error.code="cuil_invalido"`; duplicate CUIL → 409 `cuil_duplicado`; `GET /personas?cuil=` filter; `GET /personas/buscar?q=` autocomplete; `GET /personas/{id}` ficha; `PATCH` cannot change dni/cuil. Persona create must require ≥1 referencia in payload (validated in app per spec). Assert audit event written.
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement** Pydantic `PersonaCreate` (all required fields per spec §1, `referencias: list[ReferenciaIn]` min_length=1), service that validates CUIL via Task 6, checks duplicate, persists persona+referencias in one transaction, writes audit. Router for all M01 endpoints in spec §3.
- [ ] **Step 4: Run, confirm green.**
- [ ] **Step 5: Commit** `feat(m01): alta, busqueda y ficha de personas con validaciones`.

---

## Task 8: M01 — referencias, marcas

**Files:** `backend/app/m01_personas/{servicio.py,router.py}`
**Test:** `backend/tests/api/test_personas_referencias_marcas.py`

- [ ] **Step 1: Write failing tests**: add referencia → 201; delete referencia; add marca operativa/lista negra → 201; list reflects them.
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement** the referencia/marca endpoints + audit.
- [ ] **Step 4: Run, confirm green.**
- [ ] **Step 5: Commit** `feat(m01): referencias y marcas de persona`.

---

## Task 9: BCRA port + fake adapter + sync persistence

**Files:** `backend/app/bcra/{puerto.py,fake.py,http.py,servicio.py,router.py}`
**Test:** `backend/tests/api/test_bcra.py`

- [ ] **Step 1: Write failing tests**: `POST /personas/{id}/deuda-bcra/sync` (and `POST /bcra/consultar/{persona_id}`) with `FakeBcraClient` injected → 200, persists `persona_deuda_bcra` rows with normalized `situacion`/`monto`/`fecha_informe`; `GET /personas/{id}/deuda-bcra` and `GET /bcra/{persona_id}/historial` return them; sync writes an audit event (spec §5.8). Assert that approval-blocking data is now persisted (a query returns the latest `fecha_informe`).
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement** `BcraClient` protocol with `async def consultar(cuil) -> list[DeudaBcraNormalizada]`; `FakeBcraClient` returns deterministic fixture deudas; `HttpBcraClient.consultar` raises `NotImplementedError("integracion real pendiente")`; service persists rows + audit; both router surfaces wired; client chosen by `configuracion.ambiente` (fake in local/test) via a dependency.
- [ ] **Step 4: Run, confirm green.**
- [ ] **Step 5: Commit** `feat(bcra): puerto + FakeBcraClient + sync con persistencia y auditoria`.

---

## Task 10: M15 — catálogo de productos + versiones + gastos

**Files:** `backend/app/m15_catalogo/{schemas.py,servicio.py,router.py}`
**Test:** `backend/tests/api/test_catalogo_productos.py`

- [ ] **Step 1: Write failing tests**: `POST /productos` creates in `borrador`; `GET /productos`; `GET /productos/{id}` with gastos/plazos/matrices; `PATCH` creates a new `producto_version`; `POST /productos/{id}/publicar` → `activo`; non-admin blocked. Money fields serialize as strings with 2 decimals.
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement** product CRUD with versioning, gasto_originacion management, publish transition, RBAC, audit. Pydantic serializers force `Decimal` → `str` 2dp for money (a shared `MontoStr` annotated type that validates `Decimal` and serializes via `str(redondear(v))`).
- [ ] **Step 4: Run, confirm green.**
- [ ] **Step 5: Commit** `feat(m15): catalogo de productos con versiones y gastos`.

---

## Task 11: M15 — perfiles de pricing + matrices

**Files:** `backend/app/m15_catalogo/{servicio.py,router.py}`
**Test:** `backend/tests/api/test_matrices.py`

- [ ] **Step 1: Write failing tests**: create perfil; `PUT /matrices/tasas` bulk upsert (producto×perfil×plazo → tasa); `GET /matrices/tasas`; `PUT/GET /matrices/comisiones`. Rates use NUMERIC(10,4) scale, serialized as strings.
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement** perfil + matriz bulk endpoints + RBAC + audit.
- [ ] **Step 4: Run, confirm green.**
- [ ] **Step 5: Commit** `feat(m15): perfiles de pricing y matrices de tasa/comision`.

---

## Task 12: M15 — simuladores over `nexocred_core`

**Files:** `backend/app/m15_catalogo/{schemas.py,servicio.py,router.py}`
**Test:** `backend/tests/api/test_simuladores.py`

- [ ] **Step 1: Write failing tests**: `POST /simulador/otorgante` with capital/tasa/plazo/periodicidad returns a cronograma whose rows have money as strings, totals reconcile, and match `nexocred_core.calcular_cronograma`; `POST /simulador/cotizador` (accessible wording, same math); `POST /simulador/interno` resolves a perfil → tasa from the matriz then simulates. Assert the simulator NEVER computes interest itself — it calls the core. Assert money is string with 2 decimals.

```python
from decimal import Decimal

import pytest

pytestmark = pytest.mark.asyncio


async def test_simulador_otorgante_usa_core(client, admin_token):
    payload = {"capital": "10000.00", "tasa_interes_directo": "0.10",
               "cantidad_cuotas": 5, "periodicidad": "mensual",
               "fecha_primera_cuota": "2026-01-10"}
    r = await client.post("/api/v1/simulador/otorgante", json=payload,
                          headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    body = r.json()
    assert body["total_a_pagar"] == "11000.00"
    assert all(isinstance(f["cuota"], str) for f in body["cuotas"])
    assert body["cuotas"][0]["cuota"] == "2200.00"
```

- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement** the three simulators delegating to `nexocred_core.calcular_cronograma` (and `calcular_payoff` where useful), mapping `Decimal`→string. `/simulador/interno` resolves perfil+matriz to a `tasa` then builds `TerminosPrestamo`.
- [ ] **Step 4: Run, confirm green.**
- [ ] **Step 5: Commit** `feat(m15): simuladores otorgante/cotizador/interno sobre nexocred_core`.

---

## Task 13: Idempotency helper wired + OpenAPI export

**Files:** `backend/app/idempotencia.py` (helper fn), `backend/scripts/exportar_openapi.py`
**Test:** `backend/tests/db/test_idempotencia.py`, `backend/tests/api/test_openapi.py`

- [ ] **Step 1: Write failing tests**: `guardar_resultado_idempotente(session, clave, operacion, respuesta)` inserts once; a second call with same (clave,operacion) returns the stored response without duplicate insert (unique constraint). `GET /openapi.json` returns a schema containing the implemented paths (`/api/v1/auth/login`, `/api/v1/personas`, `/api/v1/productos`, `/api/v1/simulador/otorgante`).
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement** the idempotency helper (used by later stages; here just the store + dedupe). Add `scripts/exportar_openapi.py` that dumps `app.openapi()` to `docs/openapi/f1a.json`.
- [ ] **Step 4: Run, confirm green.** Export the OpenAPI file and commit it.
- [ ] **Step 5: Commit** `feat(backend): helper de idempotencia + export OpenAPI F1a`.

---

## Task 14: F1a full gate

- [ ] **Step 1: Run the whole suite.** `docker compose up -d db && conda run -n nexocred python -m pytest -q` → all green (core 69 + entorno + all F1a).
- [ ] **Step 2: Clean-DB migration check.** `cd backend && DATABASE_URL_SYNC=...nexocred conda run -n nexocred alembic upgrade head` on a freshly dropped DB → success.
- [ ] **Step 3: Lint + typecheck.** `conda run -n nexocred ruff check backend/app backend/tests && conda run -n nexocred pyright backend/app` → clean.
- [ ] **Step 4: Money-as-string spot check.** Grep simulators/serializers to confirm no `float(` on money and all money response fields are strings.
- [ ] **Step 5: Commit gate marker.** `chore(backend): F1a gate verde`.

---

## Acceptance Gate (maps to master-plan Stage 2)

- [ ] Alembic upgrades a clean database (Task 3 Step 7, Task 14 Step 2).
- [ ] Auth/RBAC blocks unauthorized access (Task 4, Task 5: 401/403 tests).
- [ ] Persona creation rejects invalid/missing required fields and duplicate CUIL (Task 7: 422/409 tests).
- [ ] Solicitud approval is NOT implemented (correct for F1a), but BCRA data needed to block it later IS persisted (Task 9).
- [ ] Simulators return money as strings with two decimals (Task 12).
- [ ] BRIN/GIN indexes and the idempotency store exist in the migration (Task 3, Task 13).
- [ ] OpenAPI for implemented endpoints is exported (Task 13) — frozen contract for the frontend stage.

---

## Self-Review against spec §1–§5

- **§1 ficha obligatoria, CUIL único módulo 11, BCRA no bloquea alta** → Tasks 6,7,9. ✅
- **§2 DDL normativo + deltas + stubs documentados** → Tasks 2,3. ✅
- **§3 contratos M01/M12/M15/BCRA** → Tasks 4,5,7,8,9,10,11,12. ✅ (M02/M03/M04/M05/etc. endpoints are later stages; their tables exist as stubs.)
- **§4 stack, BRIN/GIN indexes** → Tasks 1,3. ✅
- **§5.0 idioma** → enforced in naming throughout. ✅
- **§5.1 core as boundary** → simulators call `nexocred_core`, never recompute (Task 12). ✅
- **§5.2 money Decimal / string serialization** → `MontoStr` type (Task 10), simulator tests (Task 12). ✅
- **§5.7 idempotency store** → Tasks 3,13 (store + helper; per-operation wiring lands in F1b). ✅
- **§5.8 auditoría mínima** → audit writes in Tasks 4,5,7,8,9,10,11 (login/logout/refresh failed, user CRUD/roles, persona alta/mod, BCRA sync, parámetros/productos/matrices). ✅
- **§5.9 BCRA port fake/http** → Task 9. ✅
- **Out of scope (carried to F1b+):** solicitud lifecycle/approval-blocking logic, payment endpoints, per-operation idempotency wiring, document generation. Tables exist as stubs so FKs resolve.
```
