# Auditoría adversarial full-stack — 2026-06-14

> Auditoría de todo el stack (frontend, backend, contrato API, DB, seguridad)
> tras el rebuild del frontend. Metodología: 4 agentes con lentes independientes
> + verificación en vivo de cada hallazgo contra el backend real (datos sembrados).
> Todo lo crítico/alto/medio fue arreglado, testeado y verificado en vivo.

---

## Resumen

| Severidad | Encontrados | Estado |
|-----------|-------------|--------|
| CRÍTICO | 4 (3 IDOR + tolerancia) | ✅ arreglados |
| ALTO | 3 (visitar idempotencia + IDOR listados) | ✅ arreglados |
| MEDIO | varios (cronograma, mismatches) | ✅ arreglados |
| COSMÉTICO | varios (labels) | ✅ arreglados |
| DEUDA | performance / infra | 📋 ver `DEUDA_TECNICA.md` |

---

## 1. Seguridad — IDOR (fuga de datos entre usuarios)

Confirmado **en vivo**: un cobrador veía y leía rutas/paradas/rendiciones de otros
cobradores; un vendedor podía ver comisiones ajenas. Violaba el ownership del spec §5.11.

**Arreglado** (`m05_ruta/router.py`, `m09_comisiones/router.py`):
- `listar_rutas`/`listar_paradas`/`detalle` fuerzan `cobrador_id = actor.id` para no-admin.
- Nuevo `_get_rendicion_propia` en detalle/descargo/cambiar_estado/crear de rendiciones.
- Comisiones: `vendedor_id` forzado a `actor.id` (comisiones/cartera/pipeline/devengo/liquidaciones).
- `crear_ruta` no-admin fuerza `cobrador_id`.
- +9 tests de regresión (403 cruzado). **Verificado en vivo**: ruta ajena → 403, propia → 200.

## 2. Dinero (backend)

- **CRÍTICO — tolerancia re-cobraba plata perdonada**: marcaba la cuota `tolerada`
  pero no daba de baja el remanente → punitorio infinito + re-cobro en payoff.
  Arreglado con imputación `AJUSTE_TOLERANCIA` que lleva la cuota a cero exigible.
  Verificado: payoff posterior NO re-factura.
- **ALTO — `visitar` de la Ruta sin idempotencia**: doble cobro en retry. Ahora acepta
  `pago_id`/`Idempotency-Key` del device y dedupe como `sync`.
- **MEDIO — cronograma con última cuota negativa**: largest-remainder, todas ≥ 0 y suma
  exacta (property test Hypothesis).

## 3. Mismatches frontend ↔ backend

Causa sistémica: los mocks MSW reproducían la forma que el componente quería, no la del
backend real → tests verdes pero producción rompía. **Alineados componente + hook + mock**:

- Liquidaciones paginadas (CRASH Tesorería) · cuotas array sin `saldo` (cronograma vacío) ·
  payoff sin `fecha_negocio` (422) · aging del Tablero con claves erradas (mostraba $0) ·
  labels de concepto/severidad/porcentaje. **Verificado en vivo**: las pantallas cargan sin crash.

## 4. Robustez (frontend)

- `getToken`/`getSessionUser` con try/catch (localStorage corrupto crasheaba el boot).
- Idempotency-key estable en novación/corrección (evita doble operación en retry).
- `MoneyText` con try/catch + `ErrorBoundary` (string inválido ya no pinta pantalla blanca).
- `PagoForm` valida préstamo/caja/monto antes de enviar.

## 5. Verificado correcto (sin hallazgos)

- Migraciones Alembic (upgrade/downgrade limpio), JWT (exp/alg/type validados, secret por
  defecto bloquea prod), idempotencia con advisory lock transaccional, ledger append-only
  (correcciones = contra-asientos, sin UPDATE/DELETE), sin inyección SQL, logs sin secretos.

## Deuda registrada (no bugs activos)

Ver [`DEUDA_TECNICA.md`](DEUDA_TECNICA.md): paginación en SQL (auditoría ya migrada),
N+1 en jobs, defensa del ledger a nivel DB (requiere rol app ≠ owner).

---

*Commits: `d20e386` (fixes auditoría), `0e7b1c1` (deuda + paginación SQL).*
