# Deuda técnica — NexoCred

> Registro de deuda conocida y pendientes. No son bugs activos (lo crítico/alto/
> medio de comportamiento ya fue arreglado y verificado en vivo — ver commits de
> la auditoría 2026-06-14). Es deuda de performance, infraestructura y alcance.

Última actualización: 2026-06-14.

---

## 1. Performance / escalabilidad (deuda, no rompe hoy)

### 1.1 Paginación en memoria sobre tablas que crecen sin techo
- **Qué**: `app/paginacion.py` (`paginar()`) corta una lista YA materializada. Los
  `select()` sin `.limit()` traen la tabla entera y recién después cortan en memoria.
- **Dónde** (peor a mejor): `auditoria_evento` (`m12_auth/router.py` `listar_auditoria`,
  crece monótono, una fila por operación de dinero), `pago` (`m04_pagos/servicio.py`),
  `movimiento_caja` (`m04_caja/servicio.py`), `prestamo` (`m03_prestamos/servicio.py`).
- **Impacto**: hoy inocuo (volúmenes chicos). A escala: O(tabla entera) por request,
  memoria y latencia crecientes.
- **Fix**: paginar en SQL (`.limit().offset()` + `count()`) en estos servicios; el
  `Pagina[T]` ya está, solo cambia el cómo se llena. **PARCIALMENTE ABORDADO** —
  ver `app/paginacion.py::paginar_query`.

### 1.2 N+1 en jobs y servicios sobre la cartera
- **Dónde**: `m07_riesgo/servicio.py` (`cartera_riesgo`), `jobs/punitorios.py`,
  `m05_ruta/servicio.py` (`generar_ruta`), heredado por `jobs/aging.py`,
  `snapshot.py`, `workflows_job.py`, `jobs/rutas.py`. Bucles con 2-3 queries por
  préstamo/parada.
- **Impacto**: hoy inocuo (33 préstamos). Escala mal.
- **Fix de mayor palanca**: batch-load de cuotas/imputaciones por lista de IDs dentro
  de `snapshot_prestamo`/`saldo_exigible_prestamo`.

---

## 2. Infraestructura / seguridad (requiere decisión de despliegue)

### 2.1 Defensa en profundidad del ledger append-only
- **Qué**: la inmutabilidad de `pago`, `movimiento_caja`, `imputacion` es solo
  convención de código (hoy respetada: no hay UPDATE/DELETE en ningún endpoint;
  las correcciones son contra-asientos). No hay barrera a nivel DB.
- **Por qué no se aplicó un `REVOKE UPDATE/DELETE`**: la app se conecta como `nexocred`,
  que es el **owner** de las tablas. Postgres **ignora REVOKE sobre el owner**. Para
  que funcione hace falta un **rol de app separado del owner** (cambio de arquitectura
  de despliegue), o triggers `BEFORE UPDATE/DELETE` que solo permitan la transición
  legítima de corrección.
- **Decisión pendiente**: definir el modelo de roles de DB de producción (app-role ≠
  owner) y entonces aplicar REVOKE, o implementar los triggers.

---

## 3. Pendientes de alcance (ya conocidos pre-rebuild)

- **Formulario de aporte/retiro de tesorería**: el endpoint backend existe y está
  probado; falta la UI (botón debe usar `TransactionButton`).
- **Reconstrucción histórica as-of de riesgo**: diferida por decisión de POC. El riesgo
  se calcula a fecha de corte sobre el estado actual; los snapshots persistidos son el
  mecanismo de historización disponible.
- **Decisiones de política de negocio con sign-off pendiente**: ver `RELEASE_NOTES.md`.

---

## 4. Cosméticos menores (no bloqueantes)

- `useCambiarEstadoRendicion.onSuccess` (`rendicionHooks.ts`) hace `setQueryData` pero
  no invalida la query → campos derivados (diferencia, totales) quedan stale hasta
  recargar.
- `Cuota.estado` y `MovimientoCaja` no declaran su CHECK en el modelo ORM (solo en la
  migración). El CHECK sí existe en DB. Drift cosmético de declaración.
- 6 warnings de ESLint (reglas react-hooks experimentales sobre la lógica offline de
  La Ruta, que la usa a propósito y tiene testeada). Intencionalmente en `warn`.
