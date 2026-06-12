# NexoCred — RUNBOOK (puesta en marcha local + demo)

POC de gestion de creditos (originacion, prestamos, pagos/waterfall, ruta de
cobranza offline, riesgo, comisiones, tesoreria, La Torre). Backend FastAPI +
SQLAlchemy async + Celery; frontend React + Vite + TanStack; Postgres 18 +
Redis 7; orquestado con Docker Compose.

## 1. Requisitos

- Docker + Docker Compose.
- Para desarrollo backend: `conda` con el entorno `nexocred`
  (`conda env create -f environment.yml`).
- Para desarrollo frontend: Node 20+ y `npm` (en `frontend/`).

## 2. Arranque de cero (clone -> demo)

```bash
git clone <repo> nexocred && cd nexocred

# 2.1 Infra primero (db + redis).
docker compose up -d db redis

# 2.2 Build del frontend ANTES de levantar `web` (nginx sirve frontend/dist;
#     sin assets, `web` responde 404 hasta que exista el build).
cd frontend && npm ci && npm run build && cd ..

# 2.3 Levantar api + worker + beat + web (ya con dist disponible para `web`).
docker compose up -d                 # api + worker + beat + web

# 2.4 Migraciones (esquema). alembic lee DATABASE_URL_SYNC (psycopg), NO DATABASE_URL.
docker compose exec api micromamba run -n base \
  env DATABASE_URL_SYNC=postgresql+psycopg://nexocred:nexocred@db:5432/nexocred \
  alembic -c backend/alembic.ini upgrade head
#   (o, en local con conda y la DB publicada en :5432:)
#   DATABASE_URL_SYNC=postgresql+psycopg://nexocred:nexocred@localhost:5432/nexocred \
#     conda run -n nexocred alembic -c backend/alembic.ini upgrade head

# 2.5 Siembra demo determinista, idempotente y crash-safe (via los servicios).
#     El script vive en backend/scripts/ → se invoca DESDE backend/ con -m.
#     El runtime async lee DATABASE_URL (asyncpg), NO DATABASE_URL_SYNC.
(cd backend && DATABASE_URL=postgresql+asyncpg://nexocred:nexocred@localhost:5432/nexocred \
  conda run -n nexocred python -m scripts.seed_demo)
#   Produce ~20 personas (CUILs validos), 12 prestamos (algunos en mora),
#   pagos, ruta+visitas+rendicion, comisiones+liquidacion pagada, alertas y un
#   snapshot -> La Torre con KPIs no-cero. NO muta PARAMETROS_GLOBALES (la
#   vigencia BCRA queda en su default). Re-correrla NO duplica; si se corta a
#   mitad, una nueva corrida RESUME (el marcador de completitud se escribe ultimo).

# 2.6 Si cambiaste el frontend, re-buildear y recargar el volumen dist de `web`.
cd frontend && npm run build && cd ..
docker compose up -d web   # recarga el volumen dist
```

Abrir la app: `http://localhost:8080` (web/nginx, proxya `/api` -> api:8000).
API directa: `http://localhost:8001` (`/healthcheck` -> `{"estado":"ok"}`).

## 3. Orden de los stages (referencia)

Stage 1 catalogo/auth/personas -> 2 originacion -> 3 prestamos -> 4 pagos/caja
-> 5 ruta -> 6 novaciones -> 7 riesgo/comisiones/tesoreria/torre/documentos ->
8 hardening (este). Las migraciones alembic estan ordenadas; `upgrade head`
deja el esquema completo.

## 4. Demo click-path (guion)

1. **Login** como admin (en la demo sembrada: `admin.demo@nexocred.test` /
   `demo12345`).
2. **Personas**: abrir una persona sembrada -> ver 360, deuda BCRA sincronizada.
3. **Solicitudes**: tomar una solicitud -> Evaluar (score+perfil+tasa) ->
   Aprobar y desembolsar (genera prestamo, cronograma y egreso de caja; el
   boton se deshabilita + spinner mientras postea).
4. **Pagos**: Registrar pago de mostrador -> ver el waterfall de imputaciones
   (capital/interes/punitorio) con dinero como string. Probar Corregir pago
   (ledger append-only).
5. **La Ruta**: abrir una ruta -> capturar una visita con cobro (offline-first;
   se encola en IndexedDB) -> Sincronizar (idempotente: re-sync no duplica).
6. **Rendicion**: cerrar la rendicion de la ruta (reconcilia total cobrado).
7. **Vendedores**: ver comisiones devengadas -> Generar liquidacion del periodo
   -> Aprobar -> Pagar (egreso de caja; boton transaccional).
8. **Riesgo**: tablero PAR/aging/cosechas; alertas de mora activas.
9. **Tesoreria / La Torre**: pulso con KPIs (vigentes, en mora, colocacion,
   intereses, capital disponible) — todos no-cero gracias a la siembra.
10. **Documentos**: generar un pagare del prestamo (numero + hash SHA-256).

## 5. Jobs programados (Celery beat)

El servicio `beat` agenda (zona America/Argentina/Buenos_Aires):

- `punitorios` 02:00 — devengo de punitorios por cuota.
- `aging` 02:30 — recomputo de buckets de mora.
- `snapshot` 03:00 — snapshot de cartera del dia.
- `generar_rutas` 06:00 — ruta diaria por cobrador activo.
- `barrer_workflows` cada hora — motor de workflows §7.2 sobre mora.

Disparo on-demand (para demo, sin esperar al beat): endpoints admin
`POST /api/v1/torre/snapshot`, `/jobs/punitorios`, `/jobs/aging`.

## 6. Backup y restore

```bash
# Backup (formato custom comprimido a ./backups/).
DATABASE_URL_SYNC=postgresql://nexocred:nexocred@localhost:5432/nexocred \
  backend/scripts/backup.sh ./backups

# Restore (DROPea y recrea; usar con cuidado).
DATABASE_URL_SYNC=postgresql://nexocred:nexocred@localhost:5432/nexocred \
  backend/scripts/restore.sh ./backups/nexocred_<stamp>.dump
```

Dentro del contenedor db: `docker compose exec db pg_dump ...` /
`docker compose exec -T db pg_restore ...` con las mismas banderas.

## 7. Verificacion rapida

```bash
docker compose up -d db redis
conda run -n nexocred python -m pytest -q                 # backend
cd frontend && npm run typecheck && npm run test && npm run build
docker compose config >/dev/null && echo "compose OK"
```

## 8. Troubleshooting

- `bcra_vencido` al aprobar: la vigencia BCRA por defecto es 30 dias; ampliar
  via `PATCH /api/v1/parametros {"bcra_vigencia_dias": N}`. (La siembra demo NO
  toca este parametro: estampa fecha_informe BCRA reciente para aprobar bajo la
  vigencia por defecto.)
- La Torre vacia: correr un snapshot (`POST /api/v1/torre/snapshot`) tras sembrar.
- `web` sirve 404: faltan los assets; correr `npm run build` y recargar el
  servicio `web`.
