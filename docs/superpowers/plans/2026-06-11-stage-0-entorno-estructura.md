# Stage 0 Entorno y Estructura Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare the NexoCred repository for incremental development with Conda, a minimal Python/backend skeleton, a placeholder frontend directory, Docker services for external dependencies, and smoke verification.

**Architecture:** Stage 0 creates only the development foundation. It must not implement financial logic, database models, API business endpoints, UI screens, or migrations. Conda is the primary local Python environment, and Docker also provides a minimal `api` container for the FastAPI `/healthcheck` loop plus external services such as Postgres and Redis.

**Tech Stack:** Conda, Python 3.12, pytest, Hypothesis, Ruff, Pyright, FastAPI, Pydantic v2, SQLAlchemy 2, Alembic, httpx, Docker Compose, PostgreSQL 18, Redis.

---

## Language and Naming Rule

Plans and docs may be in English. Business concepts in product code must be in Spanish. Common technical terms may remain in English: `test`, `backend`, `frontend`, `endpoint`, `payload`, `mock`, `fixture`, `seed`, `healthcheck`, `worker`, `job`, `retry`, `lock`, `deploy`.

## Task 0.1: Reality Check Del Repo

**Files:**

- Inspect: `docs/superpowers/specs/2026-06-11-nexocred-poc-design.md`
- Inspect if present: `PRD_NexoCred_v1.0.md`
- Inspect if present: `backend/nexocred_core/money.py`
- Do not create or modify files in this task.

- [ ] **Step 1: List visible files**

Run:

```bash
find . -maxdepth 5 -type f | sort
```

Expected if the sandbox still sees only docs:

```text
./docs/superpowers/plans/2026-06-11-nexocred-poc-incremental-implementation.md
./docs/superpowers/plans/2026-06-11-stage-0-entorno-estructura.md
./docs/superpowers/specs/2026-06-11-nexocred-poc-design.md
```

- [ ] **Step 2: Check whether this is a git repository**

Run:

```bash
git status --short
```

Expected if git is available:

```text
 M docs/superpowers/specs/2026-06-11-nexocred-poc-design.md
?? docs/superpowers/plans/2026-06-11-nexocred-poc-incremental-implementation.md
?? docs/superpowers/plans/2026-06-11-stage-0-entorno-estructura.md
```

Expected if the current sandbox is not at the repo root:

```text
fatal: not a git repository (or any of the parent directories): .git
```

- [ ] **Step 3: Search for IDE-open files from the current workspace**

Run:

```bash
find . -maxdepth 6 -type f \( -name 'PRD_NexoCred_v1.0.md' -o -path './backend/nexocred_core/money.py' \) | sort
```

Expected when the files are not visible from the sandbox:

```text
```

Expected when the files are visible:

```text
./PRD_NexoCred_v1.0.md
./backend/nexocred_core/money.py
```

- [ ] **Step 4: Record the outcome in the implementation notes**

If the files are visible, preserve existing structure and continue from it. If only docs are visible, treat the workspace as a docs-only starting point and create the skeleton in later tasks. Do not overwrite any existing backend file.

## Task 0.2: Crear Directorios Base

**Files:**

- Create if missing: `backend/`
- Create if missing: `backend/app/`
- Create if missing: `backend/nexocred_core/`
- Create if missing: `backend/tests/`
- Create if missing: `backend/tests/core/`
- Create if missing: `backend/tests/api/`
- Create if missing: `backend/tests/integration/`
- Create if missing: `backend/alembic/`
- Create if missing: `frontend/`
- Create if missing: `infra/`
- Create if missing: `docs/superpowers/plans/`
- Create if missing: `docs/superpowers/specs/`

- [ ] **Step 1: Create the directory skeleton**

Run:

```bash
mkdir -p backend/app backend/nexocred_core backend/tests/core backend/tests/api backend/tests/integration backend/alembic frontend infra docs/superpowers/plans docs/superpowers/specs
```

Expected: command exits with status `0`.

- [ ] **Step 2: Add `.gitkeep` only to directories that would otherwise stay empty**

Create these files only if the corresponding directory has no real files after the skeleton is created:

```text
frontend/.gitkeep
infra/.gitkeep
backend/alembic/.gitkeep
backend/tests/api/.gitkeep
backend/tests/integration/.gitkeep
```

- [ ] **Step 3: Verify structure**

Run:

```bash
find backend frontend infra docs/superpowers -maxdepth 3 -type d | sort
```

Expected includes:

```text
backend
backend/alembic
backend/app
backend/nexocred_core
backend/tests
backend/tests/api
backend/tests/core
backend/tests/integration
frontend
infra
docs/superpowers
docs/superpowers/plans
docs/superpowers/specs
```

## Task 0.3: Configurar Conda

**Files:**

- Create: `environment.yml`

- [ ] **Step 1: Create `environment.yml`**

Write:

```yaml
name: nexocred
channels:
  - conda-forge
dependencies:
  - python=3.12
  - pip
  - pytest
  - hypothesis
  - ruff
  - pyright
  - pydantic>=2
  - fastapi
  - sqlalchemy>=2
  - alembic
  - httpx
  - uvicorn
  - pip:
      - pydantic-settings
```

- [ ] **Step 2: Create or update the Conda env**

If the env does not exist, run:

```bash
conda env create -f environment.yml
```

Expected: command exits with status `0` and creates env `nexocred`.

If the env already exists, run:

```bash
conda env update -n nexocred -f environment.yml --prune
```

Expected: command exits with status `0` and updates env `nexocred`.

- [ ] **Step 3: Verify Python version**

Run:

```bash
conda run -n nexocred python --version
```

Expected:

```text
Python 3.12.x
```

## Task 0.4: Configurar Python Tooling

**Files:**

- Create: `pyproject.toml`

- [ ] **Step 1: Create `pyproject.toml`**

Write:

```toml
[project]
name = "nexocred"
version = "0.1.0"
description = "NexoCred POC"
requires-python = ">=3.12"
dependencies = []

[tool.pytest.ini_options]
testpaths = ["backend/tests"]
pythonpath = ["backend"]
addopts = "-q"

[tool.ruff]
target-version = "py312"
line-length = 100
src = ["backend"]

[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B", "SIM"]

[tool.pyright]
include = ["backend"]
pythonVersion = "3.12"
typeCheckingMode = "basic"
extraPaths = ["backend"]
```

- [ ] **Step 2: Verify tool discovery**

Run:

```bash
conda run -n nexocred pytest --version
```

Expected starts with:

```text
pytest
```

Run:

```bash
conda run -n nexocred ruff --version
```

Expected starts with:

```text
ruff
```

## Task 0.5: Crear Paquete `nexocred_core` Vacio

**Files:**

- Create if missing: `backend/nexocred_core/__init__.py`
- Create if missing: `backend/nexocred_core/py.typed`

- [ ] **Step 1: Create `__init__.py`**

Write only if the file does not already exist:

```python
"""Core financiero puro de NexoCred."""
```

- [ ] **Step 2: Create `py.typed`**

Write an empty file:

```text
```

- [ ] **Step 3: Verify import**

Run:

```bash
conda run -n nexocred python -c "import nexocred_core; print(nexocred_core.__doc__)"
```

Expected:

```text
Core financiero puro de NexoCred.
```

## Task 0.6: Smoke Test Del Entorno

**Files:**

- Create: `backend/tests/test_entorno.py`

- [ ] **Step 1: Write the smoke test**

Write:

```python
from decimal import Decimal

import nexocred_core


def test_entorno_python_y_decimal():
    assert Decimal("0.10") + Decimal("0.20") == Decimal("0.30")


def test_importa_nexocred_core():
    assert nexocred_core.__doc__ == "Core financiero puro de NexoCred."
```

- [ ] **Step 2: Run pytest**

Run:

```bash
conda run -n nexocred pytest
```

Expected:

```text
2 passed
```

## Task 0.7: Crear Skeleton Backend App

**Files:**

- Create: `backend/app/__init__.py`
- Create: `backend/app/config.py`
- Create: `backend/app/main.py`
- Create: `backend/tests/api/test_healthcheck.py`

- [ ] **Step 1: Create `backend/app/__init__.py`**

Write:

```python
"""Backend API de NexoCred."""
```

- [ ] **Step 2: Create `backend/app/config.py`**

Write:

```python
from pydantic_settings import BaseSettings, SettingsConfigDict


class Configuracion(BaseSettings):
    ambiente: str = "local"

    model_config = SettingsConfigDict(env_file=".env", env_prefix="NEXOCRED_")
```

- [ ] **Step 3: Create `backend/app/main.py`**

Write:

```python
from fastapi import FastAPI


def crear_app() -> FastAPI:
    app = FastAPI(title="NexoCred API", version="0.1.0")

    @app.get("/healthcheck", tags=["sistema"])
    async def healthcheck() -> dict[str, str]:
        return {"estado": "ok"}

    return app


app = crear_app()
```

- [ ] **Step 4: Create `backend/tests/api/test_healthcheck.py`**

Write:

```python
from fastapi.testclient import TestClient

from app.main import app


def test_healthcheck():
    client = TestClient(app)

    response = client.get("/healthcheck")

    assert response.status_code == 200
    assert response.json() == {"estado": "ok"}
```

- [ ] **Step 5: Run API smoke test**

Run:

```bash
conda run -n nexocred pytest backend/tests/api/test_healthcheck.py
```

Expected:

```text
1 passed
```

## Task 0.8: Docker Compose Minimo Para API y Servicios Externos

**Files:**

- Create: `backend/Dockerfile`
- Create: `docker-compose.yml`
- Create: `.env.example`

- [ ] **Step 1: Create `.env.example`**

Write:

```dotenv
NEXOCRED_AMBIENTE=local
DATABASE_URL=postgresql+asyncpg://nexocred:nexocred@localhost:5432/nexocred
REDIS_URL=redis://localhost:6379/0
JWT_SECRET_KEY=change-me-in-local-env
```

- [ ] **Step 2: Create `backend/Dockerfile`**

Write:

```dockerfile
FROM mambaorg/micromamba:2.3.3

WORKDIR /app

COPY --chown=$MAMBA_USER:$MAMBA_USER environment.yml /tmp/environment.yml
RUN micromamba install -y -n base -f /tmp/environment.yml && micromamba clean --all --yes

COPY --chown=$MAMBA_USER:$MAMBA_USER backend /app/backend

ENV PYTHONPATH=/app/backend
EXPOSE 8000

CMD ["micromamba", "run", "-n", "base", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 3: Create `docker-compose.yml`**

Write:

```yaml
services:
  api:
    build:
      context: .
      dockerfile: backend/Dockerfile
    environment:
      NEXOCRED_AMBIENTE: local
      DATABASE_URL: postgresql+asyncpg://nexocred:nexocred@db:5432/nexocred
      REDIS_URL: redis://redis:6379/0
      JWT_SECRET_KEY: change-me-in-local-env
    ports:
      - "8001:8000"
    volumes:
      - ./backend:/app/backend
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy

  db:
    image: postgres:18
    environment:
      POSTGRES_DB: nexocred
      POSTGRES_USER: nexocred
      POSTGRES_PASSWORD: nexocred
    ports:
      - "5432:5432"
    volumes:
      - postgres18_data:/var/lib/postgresql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U nexocred -d nexocred"]
      interval: 5s
      timeout: 5s
      retries: 10

  redis:
    image: redis:7
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  postgres18_data:
```

- [ ] **Step 4: Validate Docker Compose config**

Run:

```bash
docker compose config
```

Expected: command exits with status `0` and prints normalized compose config.

- [ ] **Step 5: Start services**

Run:

```bash
docker compose up -d api
```

Expected: command exits with status `0`.

- [ ] **Step 6: Check service status**

Run:

```bash
docker compose ps
```

Expected: `api`, `db` and `redis` are running or healthy.

- [ ] **Step 7: Check API healthcheck through Docker**

Run:

```bash
curl http://localhost:8001/healthcheck
```

Expected:

```json
{"estado":"ok"}
```

## Task 0.9: README De Arranque

**Files:**

- Create or modify: `README.md`

- [ ] **Step 1: Create `README.md`**

Write:

````markdown
# NexoCred

POC de NexoCred.

## Entorno local

Crear o actualizar el entorno Conda:

```bash
conda env create -f environment.yml
conda activate nexocred
```

Si el entorno ya existe:

```bash
conda env update -n nexocred -f environment.yml --prune
conda activate nexocred
```

## Tests

```bash
pytest
ruff check .
pyright
```

## Servicios externos

```bash
docker compose up -d db redis
docker compose ps
```

## API en Docker

```bash
docker compose up -d api
curl http://localhost:8000/healthcheck
```

## Orden de implementacion

1. Stage 0: entorno y estructura.
2. Stage 1: `nexocred_core`.
3. Stage 2: F1a backend base, M12 minimo, M15 y M01.
4. Stage 3: F1b originacion, prestamos, caja, pagos y novaciones.
5. Stage 4: F1c campo, CRM, comercial y riesgo.
6. Stage 5: F1d tesoreria, La Torre, workflows y documentos.
7. Stage 6-7: frontend y PWA.
8. Stage 8: hardening y release candidate.
````

- [ ] **Step 2: Verify README renders as markdown**

Run:

```bash
python - <<'PY'
from pathlib import Path
text = Path("README.md").read_text()
assert "# NexoCred" in text
assert "conda env" in text
assert "docker compose" in text
print("README ok")
PY
```

Expected:

```text
README ok
```

## Task 0.10: Verificacion Final De Stage 0

**Files:**

- Inspect: all files created in Stage 0.

- [ ] **Step 1: Run tests**

Run:

```bash
conda run -n nexocred pytest
```

Expected:

```text
3 passed
```

- [ ] **Step 2: Run Ruff**

Run:

```bash
conda run -n nexocred ruff check .
```

Expected:

```text
All checks passed!
```

- [ ] **Step 3: Run Pyright**

Run:

```bash
conda run -n nexocred pyright
```

Expected: `0 errors`.

- [ ] **Step 4: Validate Docker Compose**

Run:

```bash
docker compose config
```

Expected: command exits with status `0`.

- [ ] **Step 5: Confirm Stage 0 scope was not exceeded**

Verify no financial logic, migrations, database models, business endpoints, UI screens or Celery jobs were implemented.

## Stage 0 Acceptance Criteria

- The repo has a stable backend/core/frontend/infra directory skeleton.
- Conda env `nexocred` exists and uses Python 3.12.
- `pytest`, `ruff` and `pyright` run through `conda run -n nexocred`.
- `nexocred_core` imports as an empty pure package.
- FastAPI exposes only `/healthcheck`.
- Docker Compose defines `api`, `db` and `redis`; `api` serves only `/healthcheck`.
- `README.md` documents setup, tests and service startup.
- No existing IDE-open file is overwritten.
