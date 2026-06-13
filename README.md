<div align="center">

# NexoCred

**Plataforma operativa integral para financieras de microcrédito y crédito al consumo.**

Originación · Cobranza de campo offline · Caja · Riesgo · Tesorería · Tablero de dirección

[![Estado](https://img.shields.io/badge/estado-Release%20Candidate-success)]()
[![Backend](https://img.shields.io/badge/backend-Python%203.12%20·%20FastAPI-3776AB)]()
[![Frontend](https://img.shields.io/badge/frontend-React%2018%20·%20Vite%20·%20TS-61DAFB)]()
[![Tests](https://img.shields.io/badge/tests-392%20backend%20·%20173%20frontend-success)]()

</div>

---

## Tabla de contenidos

- [¿Qué es NexoCred?](#qué-es-nexocred)
- [Arranque rápido](#arranque-rápido)
- [Cómo corre el stack](#cómo-corre-el-stack)
- [Comandos del Makefile](#comandos-del-makefile)
- [Requisitos previos](#requisitos-previos)
- [Setup manual (sin Makefile)](#setup-manual-sin-makefile)
- [Tests y calidad](#tests-y-calidad)
- [Arquitectura](#arquitectura)
- [Documentación](#documentación)

---

## ¿Qué es NexoCred?

NexoCred reúne en un solo sistema el ciclo completo de una financiera: alta de clientes (CRM 360),
evaluación y otorgamiento de crédito, cobranza puerta a puerta **offline-first** ("La Ruta"), caja,
novaciones, riesgo, comisiones, tesorería y un tablero de comando para la dirección ("La Torre").

Tres principios guían el diseño:

- 💰 **El dinero nunca se distorsiona** — todo importe es `Decimal`, redondeo `ROUND_HALF_UP`, motor financiero puro y testeado con property-based testing.
- 🔍 **Todo queda auditado** — cada pago, corrección, aprobación y cambio de parámetro deja rastro de quién, cuándo y qué cambió.
- 📴 **Se opera donde sucede** — el cobrador trabaja sin señal y sincroniza después, sin duplicar cobros.

> Para una visión de negocio orientada a dirección, ver
> [`docs/ESPECIFICACIONES_FUNCIONALES_CEO.md`](docs/ESPECIFICACIONES_FUNCIONALES_CEO.md).

---

## Arranque rápido

```bash
# 1. Crear/actualizar el entorno backend e instalar el frontend
make setup        # (o ver "Setup manual" más abajo)

# 2. Todo de una: contenedores → migrar → sembrar → backend + frontend
make demo
```

`make demo` pide una confirmación (escribí `si`), **borra y resiembra** la base con un portafolio
sintético de 6 meses, y deja todo levantado:

| Servicio | URL |
|----------|-----|
| API (healthcheck) | http://localhost:8001/healthcheck |
| Frontend | http://localhost:5173 |

¿Solo querés desarrollar sin resembrar? Usá `make dev` (levanta DB, migra y arranca backend + frontend).

---

## Cómo corre el stack

NexoCred separa **infraestructura** (en Docker) de **la aplicación** (nativa en tu máquina), para
tener hot-reload rápido en desarrollo:

| Componente | Dónde corre | Comando |
|------------|-------------|---------|
| **Postgres + Redis** | 🐳 Docker | `make up` |
| **Backend** (API, tests, migraciones, seed) | 💻 Nativo (conda env `nexocred`) | `make backend` |
| **Frontend** (Vite, tests) | 💻 Nativo (npm) | `make frontend` |

Por eso el Makefile apunta a `localhost:5432` (Postgres) y `localhost:6379` (Redis), los puertos que
publica `docker-compose.yml`.

> **Stack 100% en Docker:** alternativamente, `make up-all` levanta *todo* en contenedores
> (`api`, `worker`, `beat`, `web` nginx, `db`, `redis`), construyendo la imagen del backend desde su
> `Dockerfile`. Útil para validar el empaquetado; para el día a día se recomienda el modo nativo.

---

## Comandos del Makefile

`make help` lista todos los targets. Los más usados:

### Setup e infraestructura

| Comando | Qué hace |
|---------|----------|
| `make setup` | Crea/actualiza el env conda **e** instala dependencias del frontend |
| `make env` | Crea `.env` desde `.env.example` si no existe |
| `make up` | Levanta Postgres + Redis y espera a que la DB acepte conexiones |
| `make up-all` | Levanta **todo** el stack en Docker |
| `make down` / `make stop` | Baja / detiene los contenedores |
| `make nuke` | Baja el stack y **elimina el volumen** de Postgres (destructivo) |

### Base de datos y datos sintéticos

| Comando | Qué hace |
|---------|----------|
| `make migrate` | Aplica migraciones (`alembic upgrade head`) |
| `make reset-db` | Schema limpio (`downgrade base` → `upgrade head`) |
| `make seed` | **Borra la base** y siembra portafolio de 6 meses (pide confirmación) |
| `make seed-noconfirm` | Igual que `seed` pero sin preguntar (CI/scripts) |

### Levantar la app

| Comando | Qué hace |
|---------|----------|
| `make demo` | **Todo de una**: contenedores → migrar → sembrar → backend + frontend |
| `make dev` | Prepara la DB y levanta backend + frontend en paralelo |
| `make backend` | API con hot-reload (uvicorn) en `:8001` |
| `make frontend` | Front con hot-reload (vite) en `:5173` |
| `make worker` / `make beat` | Worker / scheduler de Celery (jobs) |

### Tests y calidad

| Comando | Qué hace |
|---------|----------|
| `make test` | Tests de backend (pytest) + frontend (vitest) |
| `make lint` | `ruff check backend` |
| `make typecheck` | `pyright` (backend) + `tsc` (frontend) |
| `make check` | Suite completa: lint + typecheck + tests |

### Backup / utilidades

| Comando | Qué hace |
|---------|----------|
| `make backup` | Dump de la base a archivo |
| `make restore f=<dump>` | Restaura la base desde un dump |
| `make clean` | Limpia artefactos de build y cachés locales |

---

## Requisitos previos

- **Docker** + Docker Compose (para Postgres y Redis)
- **Conda / Miniforge** (entorno de backend `nexocred`)
- **Node.js ≥ 20** + npm (frontend)

---

## Setup manual (sin Makefile)

<details>
<summary>Backend — entorno conda</summary>

```bash
# Crear el entorno
conda env create -f environment.yml

# …o actualizarlo si ya existe
conda env update -n nexocred -f environment.yml --prune

conda activate nexocred
```
</details>

<details>
<summary>Frontend — dependencias npm</summary>

```bash
cd frontend
npm install
```
</details>

<details>
<summary>Servicios externos y API</summary>

```bash
# Postgres + Redis
docker compose up -d db redis
docker compose ps

# Migraciones (alembic usa DATABASE_URL_SYNC)
cd backend && alembic upgrade head

# API
docker compose up -d api
curl http://localhost:8001/healthcheck
```
</details>

---

## Tests y calidad

```bash
make check          # lint + typecheck + tests (backend y frontend)
```

O por separado:

```bash
pytest              # backend
ruff check backend  # lint
pyright             # typecheck backend
cd frontend && npm run test && npm run typecheck   # frontend
```

---

## Arquitectura

### Backend

- **Python 3.12** · FastAPI · SQLAlchemy 2.0 (async) · Alembic · Pydantic v2
- **`nexocred_core`**: paquete Python **puro** (sin I/O, sin ORM, sin reloj del sistema) — el corazón financiero. Tests con Hypothesis.
- **Jobs**: Celery + Redis (devengo de punitorios, aging, snapshots, rutas, workflows)
- **PostgreSQL 18** (uuidv7 nativo)

### Frontend

- **React 18** · Vite · TypeScript
- **Datos**: TanStack Query / Table / Router · **Formularios**: React Hook Form + Zod
- **UI**: Tailwind + shadcn/ui · **Gráficos**: Tremor · **⌘K**: cmdk
- **La Ruta (PWA)**: Workbox + IndexedDB para cola offline, UUIDv7 en dispositivo

### Infraestructura

- Docker Compose: `api`, `worker`, `beat`, `web` (nginx), `db` (postgres:18), `redis`
- Variables de entorno en `.env`

---

## Documentación

| Documento | Contenido |
|-----------|-----------|
| [`docs/ESPECIFICACIONES_FUNCIONALES_CEO.md`](docs/ESPECIFICACIONES_FUNCIONALES_CEO.md) | Especificaciones funcionales orientadas a dirección |
| [`docs/superpowers/specs/2026-06-11-nexocred-poc-design.md`](docs/superpowers/specs/2026-06-11-nexocred-poc-design.md) | Spec de diseño técnico (DDL, contratos API, dominio) |
| [`docs/RELEASE_NOTES.md`](docs/RELEASE_NOTES.md) | Estado de entrega y módulos |
| [`docs/DECISIONES_NEGOCIO.md`](docs/DECISIONES_NEGOCIO.md) | Decisiones de negocio (waterfall, excedente, offline) |
| [`docs/RUNBOOK.md`](docs/RUNBOOK.md) | Operación y troubleshooting |
| [`docs/AUDITORIA_CODIGO_2026-06-12.md`](docs/AUDITORIA_CODIGO_2026-06-12.md) | Auditoría de código (críticos C1–C8) |
