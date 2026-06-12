# Decisiones de Negocio — NexoCred POC

> Estas tres definiciones fueron marcadas durante la implementación como **política de negocio** (no técnicas). El cliente delegó la decisión al **estándar de industria** (microfinanzas / crédito al consumo, AR/LatAm). Quedan resueltas y documentadas acá. Si la financiera quiere apartarse del estándar, cada una es un parámetro acotado y cambiarla es de bajo costo.

Fecha de decisión: 2026-06-12. Criterio: práctica habitual de la industria.

---

## 1. Orden de imputación de pagos

**Decisión: se mantiene el orden vigente — punitorios → interés → capital, por cuota vencida más antigua primero.**

### Estándar de industria
El orden de absorción legal y contablemente aceptado en crédito argentino/LatAm es:

1. **Punitorios** (intereses moratorios devengados) de la cuota vencida.
2. **Interés** (compensatorio) vencido de la cuota.
3. **Capital** (amortización) vencido de la cuota.
4. **Gastos/cargos administrativos exigibles**, si el producto los tiene devengados.
5/6. Interés / capital **no vencido** — solo cuando el pago opera como cancelación anticipada o novación.
7. Excedente no aplicado.

Se procesa **cuota por cuota, de la más antigua a la más nueva**: se cancela íntegramente lo exigible de la cuota más vieja antes de tocar la siguiente.

### Por qué NO se invierte a "gastos primero"
El checklist inicial sugería imputar gastos/impuestos antes que punitorios. Eso solo corresponde cuando existen **cargos administrativos exigibles devengados** como una línea de saldo propia. En este POC los productos no modelan cargos exigibles persistidos como saldo (el slot del waterfall — paso 4 — está reservado pero sin alimentar). Anteponer un concepto inexistente no cambia nada hoy y contradice el orden legal cuando ese concepto sí exista. Por eso **punitorios primero es el correcto**.

### Impacto
Con un **pago parcial**, este orden maximiza la cobertura de mora (punitorio + interés) antes de amortizar capital — protege el rendimiento de la cartera y es lo que esperan auditoría y el regulador. Cambiarlo alteraría cuánto capital se reduce con cada pago parcial.

### Implementación
`backend/nexocred_core/waterfall.py` (`aplicar_pago`), spec §5.4. **Ya implementado y testeado** (8 casos borde + property tests). No requiere cambios.

---

## 2. Tratamiento del excedente de pago

**Decisión: el excedente queda como SALDO A FAVOR del cliente; NO amortiza automáticamente cuotas futuras.**

### Estándar de industria
Cuando un cliente paga **más** que lo exigible (y no es una cancelación anticipada explícita), el excedente:

- **NO** se aplica de oficio a capital futuro ni a las últimas cuotas.
- Queda registrado como **crédito / saldo a favor** del cliente.
- Se imputa a la **próxima cuota** al vencer (o se devuelve si el cliente lo solicita).

### Por qué NO se amortiza capital automáticamente
Aplicar un excedente a capital futuro **recalcula el cronograma y reduce el interés total** sin consentimiento del cliente. En la industria esto:
- genera disputas (el cliente esperaba adelantar una cuota, no cancelar capital);
- puede violar cláusulas de precancelación (que suelen requerir aviso y a veces tienen costo);
- distorsiona el devengo de comisiones del vendedor.

La amortización de capital con un pago grande **sí** ocurre, pero **solo en modo cancelación anticipada / novación** — que es explícito (`ModoPago.CANCELACION_ANTICIPADA`), no implícito por sobrepago.

### Impacto
Un sobrepago en modo normal → `excedente` no aplicado (saldo a favor). Una cancelación total → se imputa contra interés/capital no vencido vía el waterfall (pasos 5/6). Ya es el comportamiento vigente.

### Implementación
`backend/nexocred_core/waterfall.py` (paso 7 `EXCEDENTE`; pasos 5/6 solo en modo cancelatorio), spec §5.5 casos 4 y 6. **Ya implementado y testeado.** No requiere cambios.

---

## 3. Modo offline (PWA)

**Decisión: distinción por contexto. Cobranza de campo (La Ruta) SÍ opera offline con cola idempotente; mostrador / autogestión NO permite operaciones financieras offline.**

### Estándar de industria
- **Cobrador en la calle (La Ruta):** la cobranza puerta a puerta **requiere** operar sin conexión — el cobrador recibe efectivo en zonas sin señal y debe poder registrar el pago en el momento. El estándar es **encolar localmente y sincronizar después**, con idempotencia que garantice que el sync no duplique cobros. Prohibir offline acá rompería el caso de uso central.
- **Mostrador / autogestión del cliente:** una operación financiera (registrar pago, desembolsar, solicitar crédito) **no debe** encolarse a ciegas — el operador/cliente está en un punto fijo con conexión esperable, y encolar genera ambigüedad sobre si la operación se confirmó. El estándar es **deshabilitar la acción y mostrar "Esperando conexión"**.

### Estado de implementación
- **La Ruta (campo): ✅ correcto y completo.** Cola en IndexedDB, cada visita/pago estampado con UUIDv7 de dispositivo, sync idempotente (`POST /rutas/{id}/sync` con `ON CONFLICT DO NOTHING` + dedup por PK de pago), selección de caja obligatoria para cobros, reconciliación robusta del batch, retry por conectividad/visibilidad. Background Sync + fallback manual.
- **Mostrador / pantallas no-Ruta: pendiente de guard explícito.** Hoy las pantallas de mostrador (registrar pago, desembolso, etc.) dependen de la conexión pero **no muestran un estado "offline → deshabilitado" formal**. 

### Acción requerida (menor, post-review)
Agregar un **guard de conectividad global** que, fuera de La Ruta, deshabilite los botones de acción financiera y muestre un banner "Esperando conexión" cuando `navigator.onLine === false`. La Ruta queda exenta (su flujo offline es intencional). Esto se incorpora como ítem de seguimiento — ver `RELEASE_NOTES.md`.

### Implementación
La Ruta: `frontend/src/features/ruta/*`, spec §5.7. Guard de mostrador: a implementar en el layout/`AppShell` con excepción para rutas de `features/ruta`.

---

## Resumen

| Decisión | Resolución (estándar de industria) | Estado código |
|---|---|---|
| Orden de imputación | Punitorios → interés → capital, cuota más vieja primero | ✅ ya implementado |
| Excedente de pago | Saldo a favor (no amortiza capital de oficio) | ✅ ya implementado |
| Offline | Campo encola (idempotente); mostrador deshabilita | ✅ campo / ⏳ guard mostrador |

Dos de las tres ya estaban resueltas correctamente por estándar; solo el guard de conectividad de mostrador queda como ajuste menor de frontend.
