# Auditoría de código end-to-end — 2026-06-12

Alcance: **todo el código** (backend ~15 módulos + infra + jobs + seed, frontend completo, pase de seguridad transversal), no solo el diff de `stage8-adversarial-fixes`.
Método: 8 agentes de búsqueda independientes por subsistema/ángulo → 57 candidatos → verificación adversarial de cada uno contra el código real.
Resultado: **49 hallazgos confirmados o plausibles, 3 refutados**. Severidad: 8 críticos, ~28 majors, resto minors.

Convención: ✅ CONFIRMED (trazado en el código), 🟡 PLAUSIBLE (carrera realista, ninguna constraint la previene).

---

## CRÍTICOS

### C1. ✅ Carrera de doble desembolso — `backend/app/m02_originacion/servicio_desembolso.py:87`
No hay row-lock sobre la solicitud ni unique constraint sobre `prestamo.solicitud_id`. Dos POST concurrentes a `/solicitudes/{id}/desembolsar` con Idempotency-Keys distintas pasan ambos el check `estado=='aprobada'` (el lock de caja viene después del check) → **dos Prestamos y la caja debitada dos veces** por la misma solicitud.
Fix sugerido: `SELECT ... FOR UPDATE` de la solicitud antes del check + unique constraint en `prestamo.solicitud_id`.

### C2. ✅ Doble corrección de pago — `backend/app/m04_pagos/servicio.py:329`
`corregir_uow` chequea `original.estado=='corregido'` sobre un Pago sin lock ANTES de `bloquear_prestamo`, sin re-chequear después de adquirir el lock. Dos correcciones concurrentes → **doble reversa + doble egreso de caja + deuda del cliente acreditada dos veces**.
Fix: mover el check después de `bloquear_prestamo` (o lockear el pago).

### C3. ✅ Préstamo novado sigue cobrable — `backend/app/m06_novaciones/servicio.py:73`
La novación marca el préstamo origen `estado='novado'` pero **no cierra sus cuotas pendientes**, y `registrar_pago_uow` (m04_pagos:204) nunca valida `prestamo.estado`. La deuda vieja —ya incorporada al capital del préstamo nuevo— sigue exigible y cobrable: **doble cobro al deudor** y punitorios devengando sobre el préstamo muerto.

### C4. ✅ Cobrador aprueba su propia rendición + IDOR de rutas — `backend/app/m05_ruta/router.py:227` y `:121`
- PATCH `/rendiciones/{id}` solo exige rol admin|cobrador: un cobrador presenta Y aprueba su propia rendición sin supervisor, cerrando la conciliación de efectivo.
- `visitar`/`sync`/`detalle` nunca verifican `ruta.cobrador_id == actor.id`: cualquier cobrador opera/forja pagos sobre la ruta de otro (CRM sí valida ownership; ruta no).

### C5. ✅ Doble pago de comisiones — `backend/app/m09_comisiones/servicio.py:173` y `:289`
`generar_liquidacion` no excluye devengos ya incluidos en una liquidación borrador/aprobada (solo pasan a 'liquidada' al pagar) y no hay unicidad período/vendedor → mismo devengo en dos liquidaciones. Además `pagar_liquidacion` chequea `estado=='aprobada'` sin FOR UPDATE → dos pagos concurrentes → **doble egreso de caja**; secuencialmente, liquidación 'pagada' fantasma con egreso cero.

### C6. ✅ Idempotency-Key no rota tras éxito — `frontend/src/features/pagos/RegistrarPagoPage.tsx:25`
La key se genera una vez por mount y nunca se renueva. El cajero registra un pago, luego registra OTRO pago distinto desde la misma página → el backend replayea la respuesta cacheada del primero: **el segundo pago nunca se registra y la UI muestra éxito**.
Fix: regenerar la key en `onSuccess`.

### C7. ✅ Doble-tap en visita = doble cobro — `frontend/src/features/ruta/VisitaCaptureForm.tsx:50`
`guardar()` genera `id`/`pagoId` nuevos en cada invocación y el botón no tiene guard de pending: doble tap → dos cobros distintos encolados que la idempotencia por id no puede dedupear → **doble pago aplicado al préstamo**.
Fix: usar TransactionButton / mintear los ids en el estado del form, no en `guardar()`.

### C8. ✅ Loop infinito de redirect en login — `frontend/src/routes/guards.ts:52`
Usuarios no autorizados se redirigen a `/personas`, pero `/personas` excluye los roles cobrador y tesorería → un cobrador que se loguea entra en **redirect infinito / app en blanco**.

---

## MAJORS — Dinero y pagos (m04_pagos / nexocred_core)

1. ✅ **Excedente de sobrepago desaparece** — `m04_pagos/servicio.py:81`. El excedente entra a caja pero nunca se aplica, devuelve ni acredita; el estado `'a_aplicar'` no lo setea ningún código (el endpoint `/pagos/a-aplicar` siempre devuelve vacío). El dinero sale del ledger de cuentas por cobrar.
2. ✅ **Tolerancia no persiste la quita** — `m04_pagos/servicio.py:157`. La cuota queda 'tolerada' pero el residual sigue exigible y devenga punitorio; el pago exacto de la cuota siguiente queda 'parcial' y el faltante cascadea.
3. ✅ **La deuda "resucita" tras cancelación anticipada** — `m04_pagos/servicio.py:377`. Las imputaciones `*_NO_VENCIDO` se guardan con `cuota_numero=None` y `calcular_saldo_exigible` solo cruza por `(cuota_numero, *_VENCIDO)`: cuando esas cuotas vencen, el crédito del payoff es invisible y el préstamo saldado muestra deuda plena + punitorios.
4. ✅ **Corrección fabrica punitorio retroactivo** — `m04_pagos/servicio.py:380`. El pago de reemplazo se imputa con waterfall fresco a la fecha de corrección: una cuota pagada puntual y corregida 30 días después paga 30 días de punitorio que nunca debió.
5. ✅ **Ventana de punitorio gratis** — `nexocred_core/saldo.py:50`. El punitorio se recalcula como `capital_pend ACTUAL × tasa × días totales` menos lo pagado: tras un pago parcial de capital, el devengo queda clavado en 0 hasta que el bruto sobre la base menor "alcanza" lo ya pagado (subcobro sistemático). El docstring del job promete "por tramo"; el código no lo hace.
6. ✅ **Pagos aceptados contra préstamos cancelados** — `m04_pagos/servicio.py:204`. Sin validación de `prestamo.estado`: el pago entra a caja como 100% excedente, que por el major 1 se pierde.

## MAJORS — Originación / Novaciones / BCRA

7. ✅ **PATCH estado bypasea el desembolso** — `m02/servicio.py:257`. `aprobada→desembolsada` permitido vía PATCH plano: solicitud terminalmente "desembolsada" sin préstamo, sin cuotas, sin caja, sin transición de recuperación.
8. ✅ **Consolidar no dedupea prestamo_ids** — `m06/servicio.py:191`. `[A, A]` duplica el payoff de A en el capital del préstamo consolidado → el deudor debe 2x con interés sobre el doble.
9. ✅ **Vigencia BCRA mide la fecha equivocada** — `m02/servicio.py:90`. Staleness contra `fecha_informe` (período del informe, que en la realidad lagea 45-60 días) en vez de la fecha del sync, y acepta fechas futuras: un sync fresco puede rechazarse como vencido, y un informe future-dated queda vigente para siempre.
10. ✅ **La mora histórica envenena el score para siempre** — `m02/servicio.py:100`. `max(situacion)` sobre TODA la historia (los syncs solo agregan filas): una situación 4 curada hace años sigue bajando dos bandas el score en cada solicitud futura.
11. ✅ **repactar_rapido sin bounds** — `m06/schemas.py:44` + `servicio.py:294`. `pago_cuenta` negativo infla el capital nuevo sin movimiento de caja (plata de la nada contra el deudor); `nueva_cuota='0'` → DivisionByZero → 500 dentro de la transacción lockeada.
12. 🟡 **Deadlock entre consolidaciones** — `m06/servicio.py:181`. Locks en orden provisto por el cliente (transferencia_interna sí ordena): dos consolidar solapados `[A,B]` vs `[B,A]` → DeadlockDetected → 500. (Nota: el pairing vs transferencia_interna fue refutado — recursos disjuntos — pero consolidar-vs-consolidar es real.)

## MAJORS — Riesgo / Tesorería / Torre

13. ✅ **Snapshot histórico no es as-of** — `m07/servicio.py:80`. Población filtrada por `Prestamo.estado` ACTUAL y resta TODAS las imputaciones sin corte por fecha de pago: regenerar un snapshot histórico subestima mora y colocado (préstamos pagados después del corte desaparecen). El fix del branch (filtrar `fecha_desembolso <= fecha`) corrigió un leak; estos dos quedan.
14. ✅ **Métricas de mora se contradicen entre sí** — `m07/metricas.py:49`. PAR usa `>=`, aging mete 30 en '1_30', cosechas usa `>30`, y PE pondera 90 días a 0.50 estando dentro de PAR90: con un préstamo a exactamente 30 días el tablero dice 100% y 0% de mora a la vez.
15. ✅ **DCF/cashflow ignora el as-of** — `m10/servicio.py:77`. `_cuotas_pendientes` nunca usa el parámetro `fecha` (el docstring promete un filtro que no existe): proyecta flujos de préstamos que no existían al corte y omite cuotas pagadas después.
16. ✅ **Cuotas parciales proyectadas al 100%** — `m10/servicio.py:88`. La porción ya cobrada (que está en caja y en posición) se vuelve a proyectar como entrada futura: doble conteo.
17. ✅ **posicion() mezcla bases temporales** — `m10/servicio.py:54`. `capital_disponible` es caja viva de HOY, `capital_colocado` es as-of `fecha`: utilización/semáforo incoherentes para cualquier fecha histórica (un día rojo histórico puede renderizar verde).
18. ✅ **promesas_pendientes crece para siempre** — `m11/servicio.py:129`. Cuenta toda ParadaRuta con `resultado='promesa'` de la historia, sin join a fecha ni filtro de cumplida/cerrada.

## MAJORS — Ruta / Caja en campo

19. ✅ **Rendición concilia contra un total congelado** — `m05/servicio.py:288`. `total_cobrado` se snapshotea al crear la rendición y nunca se re-suma: cobranzas sincronizadas después quedan fuera de la conciliación (diferencia=0, el efectivo nunca se le exige al cobrador).
20. ✅ **visitar sin idempotencia** — `m05/servicio.py:167`. Registra el pago con `idempotency_key=None` y el endpoint no acepta header: el retry del móvil duplica el cobro.
21. ✅ **Sync puede pisar paradas de otra ruta** — `m05/sync.py:145`. `ON CONFLICT (id) DO UPDATE` sin verificar que la fila exista en LA ruta sincronizada: un sync contra ruta B sobreescribe resultado/monto de una parada de ruta A.
22. ✅ **visitar acepta 'pago' sin monto** — `m05/servicio.py:160`. Parada marcada como pagada sin Pago ni movimiento de caja (el guard equivalente existe en sync.py pero no en visitar): divergencia silenciosa declarado-vs-cobrado.
23. ✅ **PATCH /parametros es in-memory** — `m12_auth/router.py:205`. No propaga entre workers ni sobrevive restart; `tolerancia_cobro='abc'` → InvalidOperation → 500 en cada registro de pago de ese worker. Sin whitelist de claves.

## MAJORS — Infra / Jobs / Seguridad

24. ✅ **Engine compartido entre event loops de Celery** — `app/db.py:8`. Pool QueuePool a nivel módulo + `asyncio.run()` por task prefork: conexiones asyncpg quedan ligadas a loops cerrados; `pool_pre_ping` no atrapa el RuntimeError → **cada job nocturno después del primero falla** en el mismo worker. (Misma familia de bug que el harness de tests que acabamos de arreglar con NullPool — el fix aplica acá también.)
25. ✅ **Idempotencia sin fingerprint del payload** — `app/idempotencia.py:86`. Key reusada con body distinto devuelve silenciosamente el resultado original: la segunda operación (pago, desembolso, transferencia) nunca ocurre y nada lo señala.
26. ✅ **Rutas diarias duplicables por el job** — `jobs/rutas.py:45`. SELECT-then-INSERT sin `UNIQUE(cobrador_id, fecha)` (verificado: no existe en ninguna migración): un task redelivered de Celery duplica la ruta del día con todas sus paradas.
27. ✅ **Cronograma explota en días 29-31** — `nexocred_core/cronograma.py:28`. `date(anio, mes, desde.day)` sin clamp: con la primera cuota cayendo el 29/30/31 (¡y el default es hoy+30 días!) el desembolso tira ValueError → 500. P. ej. desembolsar el 1 de enero es imposible.
28. ✅ **Logout no revoca tokens** — `m12_auth/router.py:105`. JWT stateless, refresh de 7 días, sin blacklist: un refresh token capturado sirve 7 días post-logout. Agravado por tokens en localStorage (`frontend/src/lib/auth.ts:79`, vector XSS admitido en comentario).
29. ✅ **JWT secret default en docker-compose** — `docker-compose.yml:10`. `change-me-in-local-env` hardcodeado para api/worker/beat; el guard de prod solo dispara si `NEXOCRED_AMBIENTE` no es local: compose copiado a un deploy = tokens admin forjables.
30. ✅ **Offline-exempt pero online-only** — `frontend/.../RendicionPage.tsx:100`. `/rendicion` está exenta del guard offline nuevo, pero sus mutaciones son POST/PATCH online sin `onError` renderizado: "Presentar rendición" offline falla en silencio y el cobrador cree que presentó.
31. ✅ **toCents parsea mal formato es-AR** — `frontend/src/lib/money.ts:13`. `'1.000'` → `1.00` (÷1000 silencioso), `'1.000.000'` → `1.00`. Hoy los callers le pasan strings canónicos del backend (impacto latente), pero es una mina pisada esperando un caller nuevo. Relacionado: `VisitaCaptureForm` (monto free-text sin validar, `'1.500,50'` puede 422ear el batch atómico y bloquear la cola entera).

## MINORS (verificados, menor urgencia)

- ✅ Seed: **doble devengo de comisión por préstamo** (`seed_demo.py:352` llama `devengar_por_desembolso` que `desembolsar()` ya invoca internamente) → caja y métricas de Torre del demo arrancan mal en CADA seed fresco. *Este es código nuevo del branch.*
- ✅ Seed crash-resume incompleto: cortes entre commits internos dejan ruta sin visitas / liquidación 'aprobada' nunca pagada / solicitud 'aprobada' huérfana, y el marcador igual declara completo (`seed_demo.py:373/411/320`). *Código nuevo del branch — el claim "crash-safe" es parcial.*
- ✅ CUIL: `resto==10 → dv 9` (AFIP lo trata como inválido) y no valida prefijo de tipo (`m01_personas/cuil.py:16`) — el propio comentario admite "simplificada para el POC".
- ✅ Documentos: cualquier operador descarga cualquier PDF por id (rol sin scoping) (`m13_documentos/router.py:47`).
- ✅ `documentos_dir` default `/tmp` sin guard de prod: PDFs legales emitidos se pierden en restart (`config.py:16`).
- 🟡 Rendición duplicable por carrera (sin unique en `rendicion.ruta_id`) (`m05/servicio.py:226`).
- 🟡 Versionado de producto: read-modify-write sin lock → IntegrityError 500 bajo concurrencia (`m15/servicio.py:115`).
- 🟡 Comisiones: bucketing fallback por `created_at` UTC vs `fecha_negocio` local → devengos vespertinos en el período equivocado (`m09/servicio.py:171`).
- ✅ Frontend: `invalidateQueries({queryKey:["alertas","tareas"]})` no invalida nada (clave compuesta que no matchea ningún query) (`riesgo/hooks.ts:58`).
- ✅ Frontend: badge de pendientes cuenta TODAS las rutas pero el sync drena solo la actual → "1 pendiente" fantasma + sync no-op cada 30s para siempre (`RutaPage.tsx:43`).

## REFUTADOS (descartados con evidencia)

- ❌ Reasignación arbitraria de tareas CRM: `_get_tarea` aplica 403 de ownership antes (router.py:70-71).
- ❌ Deadlock consolidar-vs-transferencia: lockean recursos disjuntos (préstamos vs cajas). El riesgo real es consolidar-vs-consolidar (queda como 🟡 #12).
- ❌ SQL injection: el único `text()` (advisory lock en idempotencia.py:77) está parametrizado con bindparams. Backend limpio.

---

## Relación con el branch `stage8-adversarial-fixes`

Casi todo lo encontrado es **pre-existente en main** — el branch no lo introduce ni lo empeora. Lo atribuible al branch:
- Seed: doble devengo de comisión (minor, afecta solo datos demo) y los 3 gaps de crash-resume (minors).
- Offline guard: la exención de `/rendicion` sin manejo de error offline (major #30) — la exención fue una decisión de negocio correcta, falta el `onError`.

Nada de esto invalida el merge: los fixes del branch son correctos y están verificados en verde (377 backend + 161 frontend).
