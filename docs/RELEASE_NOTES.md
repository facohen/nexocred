# NexoCred POC — Release Notes (Release Candidate)

## Modulos entregados

- **M01 Personas** — alta/edicion, referencias, marcas, deuda BCRA (cliente
  fake determinista), timeline 360.
- **M12 Auth** — usuarios, roles (admin/analista/cobrador/vendedor/operador/
  tesoreria), JWT, parametros globales.
- **M15 Catalogo** — productos+versiones, perfiles de pricing, matrices de
  tasa y comision, simulador, repricing.
- **M02 Originacion** — solicitudes, validacion de politicas, score, evaluacion
  (perfil+tasa), desembolso (prestamo + snapshot inmutable + cronograma +
  egreso de caja + devengo de comision), idempotente.
- **M03 Prestamos** — reconstruccion desde snapshot, payoff, cancelacion atomica.
- **M04 Pagos / Caja** — registrar pago con waterfall de imputaciones
  (capital/interes/punitorio/excedente), tolerancia, correccion append-only,
  cajas, movimientos, arqueo, transferencias, posicion consolidada.
- **M05 La Ruta** — generacion de ruta, captura de visita offline-first (cola
  IndexedDB, UUIDv7 de dispositivo), sync idempotente, rendicion con descargos.
- **M06 Novaciones** — refinanciacion/unificacion con trazabilidad de origen.
- **M07 Riesgo** — cartera, PAR/aging, cosechas, perdida esperada, alertas de
  mora, workflows §7.2 (efectos internos: tarea/incidente/notificacion/escalar).
- **M08 CRM** — inbox, incidentes, tareas, prospectos, asignaciones.
- **M09 Comisiones** — devengo por desembolso, clawback, liquidaciones
  (generar/aprobar/pagar con egreso de caja), idempotente.
- **M10 Tesoreria** — posicion, cashflow, DCF, rotacion, aportes/retiros.
- **M11 La Torre** — pulso, resumen, salud de cartera, operacion del dia,
  negocio, alertas live (sobre el ultimo snapshot).
- **M13 Documentos** — generacion (numero secuencial + hash SHA-256),
  descarga, anulacion.
- **Jobs** — Celery beat (punitorios/aging/snapshot/rutas/workflows) +
  disparadores admin on-demand.
- **Observabilidad** — logging JSON estructurado, request-id middleware
  (X-Request-ID), helper de log de job.
- **Infra** — Docker Compose con stack §4 completo (api/db/redis/worker/beat/
  web nginx), backup/restore, siembra demo determinista.

## Invariantes de dominio sostenidas

- Dinero SIEMPRE en `Decimal`/string (nunca float); conservacion de caja
  verificada en el e2e (cada ingreso/egreso mueve la posicion exactamente).
- `fecha_negocio` explicita; los jobs y la siembra usan fechas deterministas
  (nunca `today()` implicito para fechas de negocio).
- Snapshots de terminos inmutables; cronogramas materializados en filas.
- Idempotencia por Idempotency-Key (desembolso, pago, liquidacion, documento) y
  por (regla, dedupe_key) en workflows / device id en sync de ruta.
- Ledger de pagos append-only (la correccion reversa con contra-asiento).

## Limitaciones conocidas

1. **Reconstruccion historica as-of de riesgo DIFERIDA.** Las metricas de
   riesgo/torre se calculan a una fecha de corte sobre el estado ACTUAL de
   cuotas e imputaciones; no se reconstruye el estado de riesgo "tal como era"
   en una fecha pasada arbitraria (no hay versionado temporal de buckets). Los
   snapshots persistidos son el mecanismo de historizacion disponible.
2. **Aporte/retiro de tesoreria sin formulario en la UI.** El endpoint backend
   existe y esta probado; el `TesoreriaDashboard` del POC es read-only. Si se
   agrega el formulario, su boton debe usar `TransactionButton`.
3. **E2E de navegador (Playwright) fuera de alcance** (decision de POC). La
   cobertura end-to-end es backend-full (`tests/e2e/test_lifecycle_e2e.py`,
   ciclo completo con conservacion de dinero) + smoke de frontend (Vitest+MSW).

## Decisiones de POLITICA DE NEGOCIO PENDIENTES (requieren sign-off de producto)

> No se inventaron respuestas. Se implemento la opcion mas consistente con la
> especificacion vigente y se deja la decision abierta.

1. **Orden de imputacion del waterfall vs §5.4.** El waterfall actual imputa en
   un orden (capital/interes/punitorio) que debe confirmarse contra el orden de
   prelacion definitivo de §5.4. *Abierto: confirmar prelacion exacta y si los
   punitorios preceden o siguen al interes vencido.*
2. **Manejo del excedente de un pago.** Hoy el excedente se registra como tal
   en el pago. *Abierto: definir si el excedente queda como SALDO A FAVOR del
   cliente o si AMORTIZA AUTOMATICAMENTE las ultimas cuotas del cronograma.*
3. **Modo offline-strict para el mostrador.** La Ruta es offline-first; el
   mostrador hoy opera online. *Abierto: definir si el mostrador debe soportar
   captura offline-strict (cola local + sync) como la ruta, o permanecer online.*

## Verificacion final (Release Candidate)

> Completada en la pasada final (Stage 8, Task 9). Resultados:

- Backend: `conda run -n nexocred python -m pytest -q` -> _ver seccion al pie_.
- Frontend: `npm run typecheck && npm run test && npm run build` -> verde.
- Migraciones en DB limpia: `alembic upgrade head` alcanza la ultima revision.
- Lint/typecheck: `ruff check backend` + `pyright backend/app` -> limpio.
- Compose: `docker compose config` -> valido (stack §4 completo).
- Siembra -> Torre: `torre/pulso` con KPIs no-cero.

### Resultados registrados

- **Backend:** 384 tests, 384 passed (incluye los 349 previos + Stage 8).
- **Frontend:** 35 archivos, 154 tests passed; typecheck y build verdes.
- **Migraciones limpias:** `alembic upgrade head` OK (DB scratch nueva).
- **Lint/typecheck:** ruff clean; pyright 0 errores en `backend/app`.
- **Compose:** `docker compose config` valido.
- **Siembra -> Torre:** 20 personas / 12 prestamos / 4 en mora; pulso ->
  vigentes=12, en_mora=4, colocacion=800000.00, intereses=15000.00,
  capital_disponible no-cero.
