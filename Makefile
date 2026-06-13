# ============================================================================
# NexoCred — Makefile
# ----------------------------------------------------------------------------
# Tareas para levantar, sembrar, testear y operar el stack local.
#
#   make help            ->  lista todos los targets
#   make up              ->  db + redis en Docker
#   make migrate         ->  aplica migraciones
#   make seed            ->  datos sinteticos (RESETEA la base, pide confirmacion)
#   make backend         ->  levanta la API (uvicorn, hot-reload)
#   make frontend        ->  levanta el front (vite, hot-reload)
#   make dev             ->  db+redis+migraciones y luego backend+frontend juntos
#   make test            ->  tests de backend + frontend
#
# Convencion: el backend corre con conda env `nexocred`; el frontend con npm.
# Las URLs apuntan a localhost (db/redis publican sus puertos via compose).
# ============================================================================

# --- Configuracion ----------------------------------------------------------
CONDA_ENV       := nexocred
CONDA_RUN       := conda run --no-capture-output -n $(CONDA_ENV)
COMPOSE         := docker compose

# La API async usa DATABASE_URL; alembic (sync) usa DATABASE_URL_SYNC.
DB_ASYNC_URL    := postgresql+asyncpg://nexocred:nexocred@localhost:5432/nexocred
DB_SYNC_URL     := postgresql+psycopg://nexocred:nexocred@localhost:5432/nexocred
REDIS_URL       := redis://localhost:6379/0

# Entorno exportado a todos los comandos de backend que tocan la base.
BACKEND_ENV     := DATABASE_URL=$(DB_ASYNC_URL) \
                   DATABASE_URL_SYNC=$(DB_SYNC_URL) \
                   REDIS_URL=$(REDIS_URL) \
                   NEXOCRED_AMBIENTE=local \
                   JWT_SECRET_KEY=change-me-in-local-env

API_HOST        := 0.0.0.0
API_PORT        := 8001

.DEFAULT_GOAL := help
.PHONY: help env setup up up-all down stop logs ps wait-db \
        migrate migrate-down revision \
        seed seed-noconfirm reset-db backend worker beat frontend frontend-build dev stack demo \
        test test-backend test-frontend lint typecheck check \
        clean nuke backup restore

# ============================================================================
# Ayuda
# ============================================================================
help: ## Muestra esta ayuda
	@echo "NexoCred — targets disponibles:"
	@echo ""
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| sort \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'
	@echo ""

env: ## Crea el archivo .env desde el ejemplo si no existe
	@if [ ! -f .env ]; then cp .env.example .env && echo "Creado .env desde .env.example"; \
	else echo ".env ya existe — sin cambios"; fi

setup: env ## Crea/actualiza el env conda e instala dependencias del frontend
	@echo ">> Creando/actualizando el entorno conda '$(CONDA_ENV)'..."
	@if conda env list | grep -q "^$(CONDA_ENV) "; then \
		conda env update -n $(CONDA_ENV) -f environment.yml --prune; \
	else \
		conda env create -f environment.yml; \
	fi
	@echo ">> Instalando dependencias del frontend..."
	cd frontend && (npm ci || npm install)
	@echo ">> Setup completo."

# ============================================================================
# Contenedores / servicios externos
# ============================================================================
up: ## Levanta servicios base (postgres + redis) en background
	$(COMPOSE) up -d db redis
	@$(MAKE) --no-print-directory wait-db

up-all: ## Levanta TODO el stack en Docker (api, worker, beat, web, db, redis)
	$(COMPOSE) up -d --build
	$(COMPOSE) ps

down: ## Detiene y elimina los contenedores (conserva el volumen de datos)
	$(COMPOSE) down

stop: ## Detiene los contenedores sin eliminarlos
	$(COMPOSE) stop

ps: ## Estado de los contenedores
	$(COMPOSE) ps

logs: ## Sigue los logs de todos los servicios (Ctrl-C para salir)
	$(COMPOSE) logs -f

wait-db: ## Espera a que postgres acepte conexiones
	@echo "Esperando a postgres..."
	@for i in $$(seq 1 30); do \
		if $(COMPOSE) exec -T db pg_isready -U nexocred -d nexocred >/dev/null 2>&1; then \
			echo "Postgres listo."; exit 0; \
		fi; \
		sleep 1; \
	done; \
	echo "Postgres no respondio a tiempo."; exit 1

# ============================================================================
# Migraciones
# ============================================================================
migrate: up ## Aplica todas las migraciones (alembic upgrade head)
	cd backend && $(BACKEND_ENV) $(CONDA_RUN) alembic upgrade head

migrate-down: ## Revierte la base a cero (alembic downgrade base)
	cd backend && $(BACKEND_ENV) $(CONDA_RUN) alembic downgrade base

revision: ## Genera una nueva migracion autogenerada. Uso: make revision m="mensaje"
	cd backend && $(BACKEND_ENV) $(CONDA_RUN) alembic revision --autogenerate -m "$(m)"

# ============================================================================
# Datos sinteticos (DESTRUCTIVO)
# ============================================================================
reset-db: up ## Resetea el schema: downgrade base + upgrade head (BORRA todos los datos)
	@echo ">> Reseteando schema de la base (downgrade base -> upgrade head)..."
	cd backend && $(BACKEND_ENV) $(CONDA_RUN) alembic downgrade base
	cd backend && $(BACKEND_ENV) $(CONDA_RUN) alembic upgrade head

seed: up ## Genera datos sinteticos BORRANDO la base primero (pide confirmacion)
	@echo ""
	@echo "  \033[31m*** ADVERTENCIA ***\033[0m"
	@echo "  Esto BORRA TODOS LOS DATOS de la base local y vuelve a sembrar"
	@echo "  un portafolio sintetico de 6 meses (seed_full)."
	@echo "  Base: $(DB_ASYNC_URL)"
	@echo ""
	@printf "  Escribi 'si' para continuar: "; \
	read ans; \
	if [ "$$ans" != "si" ]; then echo "  Cancelado."; exit 1; fi
	@$(MAKE) --no-print-directory seed-noconfirm

seed-noconfirm: reset-db ## Siembra sin confirmacion (reset + seed_full). Util en CI/scripts
	@echo ">> Sembrando portafolio sintetico (seed_full)..."
	cd backend && $(BACKEND_ENV) $(CONDA_RUN) python -m scripts.seed_full --reset
	@echo ">> Siembra completa."

# ============================================================================
# Backend (API + jobs)
# ============================================================================
backend: migrate ## Levanta la API con hot-reload (uvicorn) en :8001
	cd backend && $(BACKEND_ENV) $(CONDA_RUN) \
		uvicorn app.main:app --reload --host $(API_HOST) --port $(API_PORT)

worker: ## Levanta el worker Celery (jobs)
	cd backend && $(BACKEND_ENV) $(CONDA_RUN) \
		celery -A app.jobs.celery_app worker --loglevel=info

beat: ## Levanta el scheduler Celery beat (jobs programados)
	cd backend && $(BACKEND_ENV) $(CONDA_RUN) \
		celery -A app.jobs.celery_app beat --loglevel=info

# ============================================================================
# Frontend
# ============================================================================
frontend: ## Levanta el front con hot-reload (vite) en :5173
	cd frontend && (npm ci || npm install) && npm run dev

frontend-build: ## Build de produccion del front (a frontend/dist)
	cd frontend && (npm ci || npm install) && npm run build

# ============================================================================
# Dev: backend + frontend juntos
# ============================================================================
dev: up migrate ## Prepara la base y levanta backend + frontend en paralelo
	@echo ">> Levantando backend (:8001) y frontend (:5173)..."
	@$(MAKE) --no-print-directory -j2 backend frontend

stack: up-all ## Alias de up-all (stack completo en Docker)

# ============================================================================
# Demo: un solo comando que hace TODO
# ============================================================================
demo: ## TODO de una: contenedores -> migrar -> sembrar (BORRA la base) -> backend + frontend
	@echo ""
	@echo "  \033[36m=== NexoCred — arranque de demo completo ===\033[0m"
	@echo "  Hara, en orden:"
	@echo "    1) levantar postgres + redis (Docker)"
	@echo "    2) aplicar migraciones"
	@echo "    3) \033[31mBORRAR la base\033[0m y sembrar un portafolio sintetico de 6 meses"
	@echo "    4) levantar backend (:8001) y frontend (:5173) en paralelo"
	@echo ""
	@printf "  Escribi 'si' para continuar: "; \
	read ans; \
	if [ "$$ans" != "si" ]; then echo "  Cancelado."; exit 1; fi
	@echo ">> [1-3/4] Contenedores, migraciones y siembra..."
	@$(MAKE) --no-print-directory seed-noconfirm
	@echo ">> [4/4] Levantando backend (:8001) y frontend (:5173)..."
	@echo "   API:      http://localhost:8001/healthcheck"
	@echo "   Frontend: http://localhost:5173"
	@$(MAKE) --no-print-directory -j2 backend frontend

# ============================================================================
# Tests / calidad
# ============================================================================
test: test-backend test-frontend ## Corre todos los tests (backend + frontend)

test-backend: ## Tests de backend (pytest)
	$(CONDA_RUN) python -m pytest

test-frontend: ## Tests de frontend (vitest)
	cd frontend && (npm ci || npm install) && npm run test

lint: ## Lint del backend (ruff)
	$(CONDA_RUN) ruff check backend

typecheck: ## Typecheck backend (pyright) + frontend (tsc)
	$(CONDA_RUN) pyright backend/app
	cd frontend && npm run typecheck

check: lint typecheck test ## Suite completa: lint + typecheck + tests

# ============================================================================
# Backup / restore / limpieza
# ============================================================================
backup: ## Dump de la base a archivo (backend/scripts/backup.sh)
	cd backend && ./scripts/backup.sh

restore: ## Restaura la base desde un dump. Uso: make restore f=ruta/al/dump
	cd backend && ./scripts/restore.sh "$(f)"

clean: ## Limpia artefactos de build/cache locales
	rm -rf frontend/dist frontend/node_modules/.vite \
		.pytest_cache .ruff_cache .hypothesis \
		$$(find . -type d -name __pycache__ -not -path "*/node_modules/*")

nuke: ## Baja el stack y ELIMINA el volumen de datos de postgres (DESTRUCTIVO)
	$(COMPOSE) down -v
