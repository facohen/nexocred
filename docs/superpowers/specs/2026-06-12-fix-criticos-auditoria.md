# Spec: Fix 8 Críticos de Auditoría

**Fecha:** 2026-06-12  
**Rama:** `fix/criticos-auditoria` (desde `stage8-adversarial-fixes`)  
**Estado:** Aprobado

---

## Contexto

La auditoría end-to-end de 2026-06-12 identificó 8 hallazgos críticos que implican pérdida de dinero, doble cobro o bypass de control. Este spec cubre los fixes, organizados en 3 grupos paralelizables.

---

## Grupo A — Backend: locks y constraints (C1, C2, C3, C5)

### C1 — Doble desembolso (`m02_originacion/servicio_desembolso.py`)

**Problema:** No hay row-lock sobre la solicitud ni unique constraint en `prestamo.solicitud_id`. Dos POST concurrentes con Idempotency-Keys distintas crean dos Prestamos y debitan caja dos veces.

**Fix:**
1. Agregar `UniqueConstraint("solicitud_id", name="prestamo_solicitud_uq")` al modelo `Prestamo` en `modelos_stub.py`.
2. Migración `0006_criticos.py`: `CREATE UNIQUE INDEX CONCURRENTLY prestamo_solicitud_uq ON prestamo(solicitud_id) WHERE solicitud_id IS NOT NULL`.
3. En `desembolsar()`: adquirir `SELECT solicitud FOR UPDATE` **antes** del check `estado=='aprobada'`. El segundo intento concurrente espera, re-lee estado ya `desembolsada`, y el check lo rechaza con 409.

**Tests (TDD):**
- `test_desembolso_concurrente_mismo_solicitud_crea_un_solo_prestamo`: simular dos llamadas con misma solicitud y distintos idempotency keys en la misma sesión DB (usando `asyncio.gather` o dos sesiones secuenciales con estado controlado) → exactamente un Prestamo creado.
- `test_desembolso_con_solicitud_ya_desembolsada_rechaza_409`: solicitud ya en estado `desembolsada` → 409.

---

### C2 — Doble corrección de pago (`m04_pagos/servicio.py`)

**Problema:** `corregir_uow` chequea `original.estado == 'corregido'` **antes** de `bloquear_prestamo`. Dos correcciones concurrentes ambas pasan el check → doble reversa + doble egreso de caja.

**Fix:**
1. Mover `prestamo = await bloquear_prestamo(session, original.prestamo_id)` a **antes** del check de estado (línea ~329).
2. Después de adquirir el lock, hacer `await session.refresh(original)` para leer el estado fresco del pago.
3. El check `if original.estado == 'corregido'` queda después del refresh.

**Tests (TDD):**
- `test_corregir_pago_dos_veces_lanza_409`: aplicar corrección a un pago; corregirlo de nuevo → `ErrorAPI` con código `pago_ya_corregido`.
- `test_corregir_pago_crea_una_sola_reversa`: verificar que tras corrección solo existe un Pago de reversa con monto negativo.

---

### C3 — Préstamo novado sigue cobrable (`m06_novaciones/servicio.py`)

**Problema:** `_crear_novacion()` marca el préstamo origen como `novado` pero no cierra sus cuotas pendientes. `registrar_pago_uow` no valida `prestamo.estado` → doble cobro sobre deuda ya rolada al nuevo préstamo.

**Fix:**
1. En `_crear_novacion()`, tras `origen.estado = "novado"`: ejecutar `UPDATE cuota SET estado='cancelada' WHERE prestamo_id = origen.id AND estado IN ('pendiente', 'parcial')`.
2. En `registrar_pago_uow()` (`m04_pagos/servicio.py:204`): agregar guard explícito `if prestamo.estado not in ("vigente", "en_mora"): raise ErrorAPI("prestamo_no_cobrable", ..., status=409)`.

**Tests (TDD):**
- `test_novar_cancela_cuotas_del_origen`: después de novar, todas las cuotas del préstamo origen tienen `estado='cancelada'`.
- `test_pago_sobre_prestamo_novado_rechaza_409`: `registrar_pago` sobre préstamo con `estado='novado'` → 409 con código `prestamo_no_cobrable`.
- `test_pago_sobre_prestamo_cancelado_rechaza_409`: idem para `estado='cancelado'`.

---

### C5 — Doble pago de comisiones (`m09_comisiones/servicio.py`)

**Problema A:** `generar_liquidacion` no excluye devengos ya en una liquidación `borrador` o `aprobada` → mismo devengo puede liquidarse dos veces.  
**Problema B:** `pagar_liquidacion` chequea `estado=='aprobada'` sin FOR UPDATE → dos pagos concurrentes con distintas keys ambos pasan → doble egreso de caja.

**Fix A — generar_liquidacion:**
- Agregar subquery para excluir devengos que ya tienen detalle en una liquidación con estado `borrador` o `aprobada`:
  ```python
  ya_liquidados = select(ComisionLiquidacionDetalle.comision_devengo_id).join(
      ComisionLiquidacion,
      ComisionLiquidacionDetalle.liquidacion_id == ComisionLiquidacion.id
  ).where(ComisionLiquidacion.estado.in_(["borrador", "aprobada"]))
  # agregar al WHERE: ComisionDevengo.id.not_in(ya_liquidados)
  ```

**Fix B — pagar_liquidacion:**
- Agregar `bloquear_liquidacion()` (helper análogo a `bloquear_caja`) que hace `SELECT ... FOR UPDATE` sobre `ComisionLiquidacion`.
- Llamar antes del check `estado == 'aprobada'`. Agregar `bloquear_liquidacion` a `locking.py`.

**Tests (TDD):**
- `test_generar_liquidacion_dos_veces_no_duplica_devengos`: generar liquidación, aprobarla, generar otra del mismo período → segunda tiene `monto_total=0` (devengos ya incluidos).
- `test_generar_liquidacion_excluye_devengos_en_borrador`: devengo en liquidación `borrador` → no aparece en nueva liquidación del mismo período.
- `test_pagar_liquidacion_idempotente_con_misma_key`: dos llamadas con la misma key → un solo egreso.

---

## Grupo B — Backend: control de acceso (C4)

### C4a — Cobrador aprueba su propia rendición (`m05_ruta/router.py`, `servicio.py`)

**Problema:** PATCH `/rendiciones/{id}` requiere solo rol `cobrador|admin`. Un cobrador puede presentar Y aprobar su propia rendición sin supervisor.

**Fix:**
1. En `cambiar_estado_rendicion()` del servicio: si `estado == 'aprobada'` y `actor_id == rendicion.cobrador_id` → `raise ErrorAPI("aprobacion_propia_no_permitida", ..., status=403)`.
2. El endpoint ya pasa `actor_id=actor.id`; no se necesita cambio en el router.

**Tests (TDD):**
- `test_cobrador_no_puede_aprobar_su_propia_rendicion`: cobrador intenta aprobar rendición de su propia ruta → 403.
- `test_admin_puede_aprobar_rendicion_de_cobrador`: admin aprueba → 200.
- `test_cobrador_puede_presentar_su_propia_rendicion`: cobrador → presentada → 200 (no bloqueado).

---

### C4b — IDOR de rutas (`m05_ruta/router.py`)

**Problema:** `visitar_parada`, `sync_ruta`, `detalle_ruta` verifican solo el rol `cobrador` pero nunca que `ruta.cobrador_id == actor.id`.

**Fix:**
- Extraer helper `_get_ruta_propia(session, ruta_id, actor)` que carga la ruta y lanza 403 si `ruta.cobrador_id != actor.id and not _es_admin(actor)`.
- Reemplazar el acceso a ruta en los 3 endpoints por este helper.
- `_es_admin(actor)` comprueba `"admin" in actor.roles`.

**Tests (TDD):**
- `test_cobrador_no_puede_visitar_ruta_ajena`: cobrador B llama `visitar` sobre ruta de cobrador A → 403.
- `test_cobrador_no_puede_sincronizar_ruta_ajena`: idem para sync.
- `test_admin_puede_visitar_ruta_de_cobrador`: admin puede operar ruta ajena → 200.

---

## Grupo C — Frontend (C6, C7, C8)

### C6 — Idempotency-Key no rota (`RegistrarPagoPage.tsx`)

**Problema:** Key generada una vez por mount, nunca rotada → segundo pago distinto desde la misma página silenciosamente dedupeado.

**Fix:**
- Convertir `const [idemKey] = useState(...)` a `const [idemKey, setIdemKey] = useState(newIdempotencyKey)`.
- En el handler `onSubmit`, tras éxito en `mutateAsync`, llamar `setIdemKey(newIdempotencyKey())`.
- En caso de error: NO rotar (el retry debe reutilizar la misma key para idempotencia).

**Tests (TDD):**
- `test_key_rota_tras_exito`: renderizar, submit exitoso → segunda consulta al mock usa key distinta.
- `test_key_no_rota_tras_error`: submit fallido → segunda consulta usa la misma key.

---

### C7 — Doble-tap en visita (`VisitaCaptureForm.tsx`)

**Problema:** `guardar()` genera `id` y `pagoId` frescos en cada invocación. Botón sin guard de pending → doble-tap → dos cobros con IDs distintos en cola.

**Fix:**
1. Subir `id` y `pagoId` a estado del componente: `const [visitaId] = useState(uuidv7)` y `const [pagoId] = useState(uuidv7)`.
2. Reemplazar el botón `<Button>` por `<TransactionButton>` (ya existe); `onGuardar` es la promesa que lo desactiva durante el envío.

**Tests (TDD):**
- `test_guardar_dos_veces_misma_instancia_produce_mismo_id`: llamar `guardar()` dos veces en la misma instancia → ambas visitas tienen el mismo `id` y `pagoId`.
- `test_boton_deshabilitado_durante_envio`: el botón queda disabled mientras `onGuardar` no resuelve.

---

### C8 — Redirect infinito en login (`guards.ts`, `router.tsx`)

**Problema:** Usuarios sin acceso a `/personas` (cobrador, tesorería) son redirigidos a `/personas` → la guard de `/personas` vuelve a redirigir → loop infinito.

**Fix:**
- Agregar `fallbackRoute(roles: Rol[]): string` en `guards.ts`:
  ```ts
  const ROLE_FALLBACK: [Rol, string][] = [
    ["cobrador",  "/ruta"],
    ["tesoreria", "/tesoreria"],
    ["vendedor",  "/solicitudes"],
    ["operador",  "/crm/inbox"],
    ["analista",  "/personas"],
    ["admin",     "/personas"],
  ];
  export function fallbackRoute(roles: Rol[]): string {
    for (const [rol, ruta] of ROLE_FALLBACK) {
      if (roles.includes(rol)) return ruta;
    }
    return "/login";
  }
  ```
- Reemplazar `throw redirect({ to: "/personas" })` por `throw redirect({ to: fallbackRoute(user?.roles ?? []) })` en `enforceRoles`.
- En `router.tsx` (redirect post-login): reemplazar el hardcode `/personas` por `fallbackRoute(user.roles)`.

**Tests (TDD):**
- `test_fallback_route_cobrador_retorna_ruta`: `fallbackRoute(["cobrador"])` → `/ruta`.
- `test_fallback_route_tesoreria_retorna_tesoreria`: → `/tesoreria`.
- `test_enforce_roles_cobrador_redirige_a_ruta_no_personas`: llamar `enforceRoles` con usuario cobrador en ruta sin acceso → redirect a `/ruta`.

---

## Migración DB

`0006_criticos.py`:
- `CREATE UNIQUE INDEX CONCURRENTLY prestamo_solicitud_uq ON prestamo(solicitud_id) WHERE solicitud_id IS NOT NULL` — partial index (novaciones crean préstamos sin solicitud_id).
- Agregar la constraint al modelo `Prestamo` en `modelos_stub.py` para que Alembic la reconozca.

---

## Alcance explícito

**Incluido:** Los 8 críticos y sus tests. Migración de DB.  
**No incluido:** Majors (se trackean en backlog separado). Refactors no relacionados.

---

## Criterio de éxito

- Suite completa verde: `≥ 377 backend + N nuevos tests` pasando, `161+ frontend`.
- Todos los nuevos tests pasan la red-green cycle antes de implementar.
- `ruff check backend` y `npm run typecheck` limpios.
