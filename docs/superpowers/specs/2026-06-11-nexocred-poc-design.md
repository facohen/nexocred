# NexoCred POC — Spec de Diseño

> Basado en PRD v1.0. Decisiones tomadas en sesión de brainstorming 2026-06-11.

---

## 1. Alcance del POC (F1 ajustado)

Construir la aplicación completa y avanzada siguiendo el roadmap F1 del PRD, con las siguientes **modificaciones explícitas**:

### Removido del PRD original
- **WhatsApp Business API** — eliminado completamente. Las notificaciones de cobranza se omiten en esta fase. Los workflows de cobranza (§7.2 familia A) funcionan sin canal de mensajería externo: generan tareas y registros CRM internos, sin envío de mensajes.
- **Identidad progresiva** — eliminada. Sin niveles 0–3, sin política por monto, sin deduplicación heurística por trigram. La ficha de cliente tiene campos obligatorios y únicos.
- **Integración WhatsApp en rendición y recibos** — eliminada.

### Modificado respecto al PRD
- **Ficha de cliente (M01):** campos obligatorios para avanzar en el flujo:
  - Datos personales: nombre, apellido, DNI, CUIL (único, validado dígito verificador módulo 11), fecha de nacimiento, estado civil, tipo de vivienda, email, teléfono principal
  - Domicilio real (con observaciones de fachada)
  - Ingresos: declarados, en blanco, totales estimados
  - Al menos 1 contacto de referencia (nombre, apellido, teléfono, vínculo)
  - **Opcional:** datos laborales (empleador, CUIT empleador, fecha ingreso)
  - **Opcional:** referido_por (persona ya registrada)
- **CUIL como identificador único:** `persona.cuil CHAR(11) NOT NULL UNIQUE`. Sin unicidad parcial. Sin niveles.
- **Consulta BCRA:** módulo separado. Se integra vía API externa. El analista la dispara manualmente desde la ficha del cliente post-alta. No bloquea el alta, pero bloquea la aprobación si no se realizó.

### Mantenido del PRD
- Todo el motor financiero §7.1 (waterfall, 8 casos borde, interés directo, Decimal)
- M02 scoring interno + perfiles de pricing
- M03 préstamos + snapshot inmutable
- M04 caja + corrección en 1 clic + tolerancia de cobro
- M05 La Ruta (PWA offline) + rendición con descargos
- M06 novaciones: refinanciación + consolidación + transferencia + Repactar rápido
- M07 riesgo + motor de alarmas
- M08 CRM 360 + tareas + operador asignado
- M09 vendedores + comisiones + clawback + portal del vendedor
- M10 tesorería + cash management
- M11 La Torre completa
- M12 RBAC + auditoría
- M13 documentos opt-in
- M15 catálogo de productos + perfiles + simuladores + repricing masivo
- Workflows automatizados §7.2 familias A y B (sin WhatsApp, con tareas CRM internas)

---

## 2. Modelo de Datos — Decisiones de Modelado

### 2.1 Alcance del DDL en esta spec

Esta spec es la fuente de verdad para las decisiones tomadas durante el POC, pero no pretende copiar cada tabla base del PRD v1.0. El implementador debe tratar esta seccion como:

- **DDL normativo** para las tablas y columnas declaradas explicitamente aca.
- **Deltas obligatorios** cuando una tabla base viene del PRD y esta spec agrega o corrige columnas, claves o restricciones.
- **Contrato de consistencia** para las FK mencionadas hacia tablas base no listadas aca, como `producto_credito`, `prestamo`, `movimiento_caja`, `comision_devengo`, `ruta_diaria`, `pago`, `imputacion`, `cuota`, `solicitud_credito`, `snapshot_cartera`, `usuario`, `rol`, `tarea`, `incidente`, `alerta` y `auditoria_evento`.

Antes de escribir la migracion F1a, el plan de implementacion debe producir un inventario de schema base completo. Si el PRD v1.0 no esta disponible en el workspace, el implementador debe crear el schema base minimo desde esta spec y documentar cada tabla inferida en la migracion inicial.

### 2.2 Cambios respecto al DDL ilustrativo del PRD

#### `persona` — simplificada, todos los campos obligatorios o explícitamente opcionales

```sql
CREATE TABLE persona (
  id                   UUID PRIMARY KEY DEFAULT uuidv7(),
  -- Identidad (todos obligatorios)
  apellido             TEXT NOT NULL,
  nombre               TEXT NOT NULL,
  dni                  TEXT NOT NULL,
  cuil                 CHAR(11) NOT NULL UNIQUE,   -- único, dígito verificador validado en app
  fecha_nac            DATE NOT NULL,
  estado_civil         TEXT NOT NULL CHECK (estado_civil IN ('soltero','casado','divorciado','viudo','union_convivencial')),
  email                TEXT NOT NULL,
  telefono             TEXT NOT NULL,
  -- Domicilio (obligatorio)
  domicilio_calle      TEXT NOT NULL,
  domicilio_numero     TEXT,
  domicilio_piso       TEXT,
  domicilio_localidad  TEXT NOT NULL,
  domicilio_provincia  TEXT NOT NULL DEFAULT 'Buenos Aires',
  observaciones_domicilio TEXT,                    -- indicaciones de fachada para el cobrador
  tipo_vivienda        TEXT NOT NULL CHECK (tipo_vivienda IN ('propia','alquilada','familiar','prestada')),
  -- Ingresos (obligatorios)
  ingresos_declarados  NUMERIC(14,2) NOT NULL,
  ingresos_en_blanco   NUMERIC(14,2) NOT NULL DEFAULT 0,
  ingresos_totales     NUMERIC(14,2) NOT NULL,
  -- Laboral (opcional)
  empleador            TEXT,
  cuit_empleador       CHAR(11),
  fecha_ingreso_laboral DATE,
  -- Relaciones (opcionales)
  referido_por_id      UUID REFERENCES persona(id),
  redes_sociales       JSONB,
  -- Control
  activo               BOOLEAN NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX persona_cuil_idx ON persona (cuil);
CREATE INDEX persona_nombre_idx ON persona (apellido, nombre);
CREATE INDEX persona_dni_idx ON persona (dni);
```

#### `persona_referencia` — al menos 1 obligatoria (validado en app, no en DB)

```sql
CREATE TABLE persona_referencia (
  id            UUID PRIMARY KEY DEFAULT uuidv7(),
  persona_id    UUID NOT NULL REFERENCES persona(id) ON DELETE CASCADE,
  nombre        TEXT NOT NULL,
  apellido      TEXT,
  telefono      TEXT NOT NULL,
  vinculo       TEXT NOT NULL CHECK (vinculo IN ('padre','madre','hermano','conyuge','pareja','hijo','vecino','companero','amigo','otro')),
  es_alternativo BOOLEAN NOT NULL DEFAULT true,
  notas         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### `persona_deuda_bcra` — cargada vía API post-alta

```sql
CREATE TABLE persona_deuda_bcra (
  id            UUID PRIMARY KEY DEFAULT uuidv7(),
  persona_id    UUID NOT NULL REFERENCES persona(id),
  entidad       TEXT NOT NULL,
  monto         NUMERIC(14,2) NOT NULL,
  situacion     SMALLINT NOT NULL CHECK (situacion BETWEEN 1 AND 6),
  fecha_informe DATE NOT NULL,
  fuente        TEXT NOT NULL DEFAULT 'api_bcra',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX persona_deuda_bcra_persona_idx ON persona_deuda_bcra (persona_id);
```

#### `gasto_originacion` — faltaba en DDL ilustrativo

```sql
CREATE TABLE gasto_originacion (
  id              UUID PRIMARY KEY DEFAULT uuidv7(),
  producto_id     UUID NOT NULL REFERENCES producto_credito(id),
  nombre          TEXT NOT NULL,
  tipo            TEXT NOT NULL CHECK (tipo IN ('porcentaje','fijo')),
  valor           NUMERIC(10,4) NOT NULL,
  financiado      BOOLEAN NOT NULL DEFAULT false,   -- true: se suma al capital; false: se deduce del desembolso
  jurisdiccion    TEXT,
  activo          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### `documento_emitido` — faltaba en DDL ilustrativo

```sql
CREATE TABLE documento_emitido (
  id              UUID PRIMARY KEY DEFAULT uuidv7(),
  prestamo_id     UUID NOT NULL REFERENCES prestamo(id),
  tipo            TEXT NOT NULL CHECK (tipo IN ('recibo','cronograma','mutuo','pagare','conformidad_novacion')),
  numero          BIGINT NOT NULL,                  -- correlativo único por tipo
  hash_sha256     TEXT NOT NULL,                    -- inmutabilidad: hash del contenido generado
  url_storage     TEXT,                             -- path en almacenamiento local/S3
  emitido_por     UUID NOT NULL REFERENCES persona(id),
  anulado_en      TIMESTAMPTZ,
  anulado_por     UUID REFERENCES persona(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tipo, numero)
);
```

#### `liquidacion_comision` y `liquidacion_detalle` — faltaban en DDL

```sql
CREATE TABLE liquidacion_comision (
  id              UUID PRIMARY KEY DEFAULT uuidv7(),
  vendedor_id     UUID NOT NULL REFERENCES persona(id),
  periodo_desde   DATE NOT NULL,
  periodo_hasta   DATE NOT NULL,
  monto_total     NUMERIC(14,2) NOT NULL,
  estado          TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador','aprobada','pagada')),
  aprobada_por    UUID REFERENCES persona(id),
  aprobada_en     TIMESTAMPTZ,
  egreso_id       UUID REFERENCES movimiento_caja(id),   -- el egreso que la paga
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE liquidacion_detalle (
  id                  UUID PRIMARY KEY DEFAULT uuidv7(),
  liquidacion_id      UUID NOT NULL REFERENCES liquidacion_comision(id),
  comision_devengo_id UUID NOT NULL REFERENCES comision_devengo(id),
  monto               NUMERIC(14,2) NOT NULL
);
```

#### `parada_ruta` — FK explícita en `pago.parada_id`

```sql
-- En la tabla pago, parada_id pasa a tener FK explícita:
-- parada_id UUID REFERENCES parada_ruta(id)
-- Decisión: FK nullable — un pago de mostrador no tiene parada.

CREATE TABLE parada_ruta (
  id             UUID PRIMARY KEY DEFAULT uuidv7(),  -- también puede nacer en el dispositivo (UUIDv7)
  ruta_id        UUID NOT NULL REFERENCES ruta_diaria(id),
  prestamo_id    UUID NOT NULL REFERENCES prestamo(id),
  orden          INT NOT NULL,
  resultado      TEXT CHECK (resultado IN ('pago','parcial','promesa','ausente','se_niega','cancelado')),
  monto_cobrado  NUMERIC(14,2),
  foto_url       TEXT,
  lat            NUMERIC(10,7),
  lng            NUMERIC(10,7),
  notas          TEXT,
  visitada_en    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### `workflow_regla` y `workflow_ejecucion` — motor de workflows §7.2

```sql
CREATE TABLE workflow_regla (
  id              UUID PRIMARY KEY DEFAULT uuidv7(),
  nombre          TEXT NOT NULL,
  familia         TEXT NOT NULL CHECK (familia IN ('cobranza','novacion','crm')),
  disparador      TEXT NOT NULL,    -- 'mora_dia_1' | 'mora_dia_3' | 'mora_dia_7' | 'mora_dia_30' | 'cancelacion_exitosa' | etc.
  condicion_json  JSONB,            -- condiciones adicionales evaluables
  accion          TEXT NOT NULL,    -- 'crear_tarea' | 'crear_incidente' | 'enviar_notificacion_interna' | 'escalar_admin'
  accion_params   JSONB,
  activo          BOOLEAN NOT NULL DEFAULT true,
  orden           INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE workflow_ejecucion (
  id              UUID PRIMARY KEY DEFAULT uuidv7(),
  regla_id        UUID NOT NULL REFERENCES workflow_regla(id),
  prestamo_id     UUID REFERENCES prestamo(id),
  persona_id      UUID REFERENCES persona(id),
  resultado       TEXT NOT NULL CHECK (resultado IN ('ok','error','omitido')),
  detalle         TEXT,
  ejecutado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### `snapshot_cartera` — añadir columnas que faltaban para La Torre completa

```sql
-- Añadir a snapshot_cartera:
ALTER TABLE snapshot_cartera ADD COLUMN IF NOT EXISTS
  prestamos_vigentes     INT NOT NULL DEFAULT 0,
  prestamos_en_mora      INT NOT NULL DEFAULT 0,
  colocacion_mes         NUMERIC(16,2) NOT NULL DEFAULT 0,
  intereses_cobrados_mes NUMERIC(16,2) NOT NULL DEFAULT 0,
  punitorios_cobrados_mes NUMERIC(16,2) NOT NULL DEFAULT 0,
  capital_disponible     NUMERIC(16,2) NOT NULL DEFAULT 0;
```

---

## 3. Contratos API (OpenAPI REST)

### Convenciones globales
- Base path: `/api/v1`
- Auth: Bearer JWT en header `Authorization`
- Paginación: `?page=1&per_page=50` → respuesta `{ data: [], total, page, per_page }`
- Errores: `{ error: { code: string, message: string, details?: object } }`
- Todos los importes en `string` con 2 decimales ("14500.00") para evitar float en JSON
- Timestamps en ISO 8601 UTC
- UUIDs en formato estándar lowercase con guiones
- Idioma de producto: conceptos de negocio, nombres de tablas, columnas, endpoints, enums, roles, permisos, seeds, textos de UI y mensajes funcionales en espanol. Se aceptan terminos tecnicos usuales en ingles cuando sean la forma natural del equipo o del ecosistema (`test`, `backend`, `frontend`, `endpoint`, `payload`, `healthcheck`, `seed`, `mock`, `fixture`, `snapshot`, `worker`, `job`, `Dockerfile`, `README`, `Idempotency-Key`, `created_at`, `updated_at`).

---

### M01 — Personas

```
POST   /personas                          Alta de persona (valida ficha completa)
GET    /personas                          Lista paginada con filtros (nombre, dni, cuil)
GET    /personas/{id}                     Ficha 360° completa
PATCH  /personas/{id}                     Actualizar campos (no DNI/CUIL una vez cargados)
GET    /personas/{id}/prestamos           Préstamos asociados (deudor + garante)
GET    /personas/{id}/timeline            Timeline unificada (interacciones + incidentes + eventos crédito)
GET    /personas/{id}/deuda-bcra          Historial BCRA cargado
POST   /personas/{id}/deuda-bcra/sync     Dispara consulta API BCRA y guarda resultado
POST   /personas/{id}/referencias         Agregar contacto de referencia
DELETE /personas/{id}/referencias/{ref_id}
POST   /personas/{id}/marcas              Agregar marca operativa / lista negra
GET    /personas/buscar?q=               Búsqueda por nombre, DNI o CUIL (para autocomplete)
```

### M02 — Originación

```
POST   /solicitudes                       Nueva solicitud (persona_id, producto_id, monto)
GET    /solicitudes                       Bandeja con filtros (estado, vendedor, fecha)
GET    /solicitudes/{id}                  Detalle + evaluación + oferta activa
PATCH  /solicitudes/{id}/estado           Transiciones: en_analisis | aprobada | rechazada | desistida
POST   /solicitudes/{id}/evaluar          Corre scoring interno, asigna perfil pricing, valida políticas
POST   /solicitudes/{id}/simular          Genera oferta con simulación en vivo (consume M15)
POST   /solicitudes/{id}/desembolsar      Crea el préstamo, impacta caja y capital (transición → desembolsada)
GET    /solicitudes/{id}/validar-politicas Checklist: edad, cuota/ingreso, BCRA, mora previa
```

### M03 — Préstamos

```
GET    /prestamos                         Lista paginada con filtros (estado, deudor, producto, fecha)
GET    /prestamos/{id}                    Detalle completo con snapshot
GET    /prestamos/{id}/cuotas             Cronograma de amortización con saldos
GET    /prestamos/{id}/pagos              Historial de pagos e imputaciones
GET    /prestamos/{id}/payoff             Calcula monto de cancelación total a una fecha dada
POST   /prestamos/{id}/cancelar          Cancelación anticipada total (consume payoff)
GET    /prestamos/{id}/documentos         Documentos emitidos asociados
```

### §7.1 — Motor de Pagos (dentro de M04)

```
POST   /pagos                             Registrar pago (prestamo_id, monto, canal, caja_id)
GET    /pagos/{id}                        Detalle con imputaciones desglosadas
POST   /pagos/{id}/corregir               Corrección 1 clic: genera contra-asiento + nuevo pago
GET    /pagos/a-aplicar                   Cola de pagos offline pendientes de imputación
POST   /pagos/{id}/aplicar                Imputar manualmente un pago en estado a_aplicar
```

### M04 — Caja

```
GET    /cajas                             Lista de cajas/cuentas
POST   /cajas                             Nueva caja
GET    /cajas/{id}/movimientos            Ledger de movimientos con filtros de fecha
POST   /cajas/{id}/movimientos            Movimiento manual (egreso/ingreso categorizado)
GET    /cajas/{id}/arqueo-pendiente       Estado del arqueo del día (teórico vs. físico)
POST   /cajas/{id}/arqueo                 Cerrar arqueo diario con conteo físico
GET    /cajas/posicion-consolidada        Suma de todas las cajas y cuentas
POST   /transferencias-internas           Mover fondos entre cajas
```

### M05 — Cobranza de Campo / La Ruta

```
GET    /rutas                             Rutas del día con estado
POST   /rutas                             Generar ruta diaria para cobrador
GET    /rutas/{id}                        Detalle de ruta con paradas (solo ruta propia o admin)
GET    /rutas/{id}/paradas                Lista de paradas con saldo exigible
POST   /rutas/{id}/paradas/{parada_id}/visitar  Registrar resultado de visita (solo ruta propia o admin)
POST   /rutas/{id}/sync                   Sync idempotente de paradas desde dispositivo (solo ruta propia o admin)
GET    /rendiciones                       Historial de rendiciones
POST   /rendiciones                       Cerrar rendición del día (cobrado - descargos)
GET    /rendiciones/{id}                  Detalle con descargos y diferencia
POST   /rendiciones/{id}/descargos        Agregar gasto de campo
PATCH  /rendiciones/{id}/descargos/{desc_id}  Aprobar/rechazar descargo (admin)
PATCH  /rendiciones/{id}/estado           Transición de estado; cobrador no puede aprobar su propia rendición (403)
```

> **Ownership:** `visitar`, `sync` y `detalle` verifican `ruta.cobrador_id == actor.id`; admin exento. Ver §5.11.

### M06 — Novaciones

```
POST   /novaciones/refinanciar            Refinanciación 1→1 (prestamo_id, condiciones)
POST   /novaciones/consolidar             Consolidación N→1 (prestamo_ids[], condiciones)
POST   /novaciones/transferir             Transferencia 1→1 nuevo deudor (prestamo_id, nuevo_deudor_id)
POST   /novaciones/repactar-rapido        Repactar rápido (prestamo_id, pago_cuenta, nueva_cuota, periodicidad)
GET    /novaciones/{id}                   Detalle de novación con origen y nuevo préstamo
GET    /prestamos/{id}/novaciones         Cadena de novaciones de un préstamo
```

### M07 — Riesgo y Alarmas

```
GET    /riesgo/tablero                    PAR30/60/90, aging, % refinanciado, pérdida esperada
GET    /riesgo/cosechas                   Curvas vintage por mes de originación
GET    /riesgo/concentracion              Por cliente, zona, vendedor, producto
GET    /alertas                           Bandeja de alertas activas con filtros
GET    /alertas/{id}                      Detalle de alerta
PATCH  /alertas/{id}/resolver             Marcar resuelta con justificación
PATCH  /alertas/{id}/asignar              Asignar a operador (crea tarea)
POST   /alertas/procesar                  Trigger manual del motor de alarmas (admin)
```

### M08 — CRM 360 y Tareas

```
GET    /tareas                            Inbox del operador logueado (o todas para admin)
POST   /tareas                            Crear tarea manual
GET    /tareas/{id}                       Detalle
PATCH  /tareas/{id}                       Actualizar estado / reasignar
POST   /tareas/{id}/completar             Completar con registro de interacción
GET    /incidentes                        Lista con filtros
POST   /incidentes                        Crear incidente manual
GET    /incidentes/{id}
PATCH  /incidentes/{id}
POST   /interacciones                     Registrar interacción (llamada, visita, etc.)
GET    /personas/{id}/tareas              Tareas del operador para esta persona
POST   /crm/asignaciones                  Asignar persona a operador
POST   /crm/asignaciones/masivo           Reasignación masiva (admin)
GET    /prospectos                        Pipeline de prospectos
POST   /prospectos                        Nuevo prospecto
PATCH  /prospectos/{id}                   Avanzar estado / promover a persona
```

### M09 — Comisiones y Vendedores

```
GET    /vendedores/{id}/comisiones        Devengadas / confirmadas / clawbacks / liquidadas
GET    /vendedores/{id}/cartera           Préstamos originados con estado y mora
GET    /vendedores/{id}/pipeline          Solicitudes activas
GET    /comisiones/liquidaciones          Lista de liquidaciones
POST   /comisiones/liquidaciones          Generar liquidación para período
PATCH  /comisiones/liquidaciones/{id}/aprobar
POST   /comisiones/liquidaciones/{id}/pagar  Genera egreso en caja
GET    /comisiones/devengo/{prestamo_id}  Comisiones asociadas a un préstamo
```

### M10 — Tesorería

```
GET    /tesoreria/posicion                Capital disponible + utilización + semáforo
GET    /tesoreria/cashflow                Proyección 30/60/90 días (entradas - egresos)
GET    /tesoreria/dcf                     DCF de cartera con escenarios
GET    /tesoreria/rotacion                Rotación de capital (anualizada)
POST   /tesoreria/aportes                 Aporte de capital
POST   /tesoreria/retiros                 Retiro de capital
GET    /tesoreria/aportes-retiros         Historial
```

### M11 — La Torre

```
GET    /torre/resumen                     KPIs del encabezado (Índice Nexo, período)
GET    /torre/pulso                       Fila 1: 5 tarjetas de número grande
GET    /torre/salud-cartera               Fila 2: aging, cosechas, cashflow, pérdida esperada
GET    /torre/operacion-hoy               Fila 3: cobranza del día, rutas, promesas, pipeline
GET    /torre/negocio                     Fila 4: colocación, rendimiento, tops
GET    /torre/alertas-live                Panel lateral: alertas activas con deep-links
```

### M12 — Admin y Seguridad

```
GET    /usuarios                          Lista de usuarios del sistema
POST   /usuarios                          Crear usuario
PATCH  /usuarios/{id}                     Actualizar roles y permisos
DELETE /usuarios/{id}                     Desactivar
POST   /auth/login                        JWT con refresh token
POST   /auth/logout
POST   /auth/refresh
GET    /auditoria                         Log de eventos de auditoría con filtros
GET    /parametros                        Configuración global del sistema
PATCH  /parametros                        Actualizar parámetros (admin)
```

### M13 — Documentos

```
GET    /documentos/{id}                   Metadata + URL de descarga
POST   /documentos/generar                Generar documento (tipo, prestamo_id)
GET    /documentos/{id}/descargar         Stream del PDF
POST   /documentos/{id}/anular            Anulación controlada con motivo
```

### M15 — Catálogo y Simuladores

```
GET    /productos                         Lista con versiones vigentes
POST   /productos                         Nuevo producto (inicia en borrador)
GET    /productos/{id}                    Detalle con gastos, plazos, matrices
PATCH  /productos/{id}                    Actualizar (genera nueva versión)
POST   /productos/{id}/publicar           Borrador → activo
GET    /perfiles-pricing                  Lista de perfiles
POST   /perfiles-pricing                  Nuevo perfil
GET    /matrices/tasas                    Matriz tasa por producto × perfil × plazo
PUT    /matrices/tasas                    Actualizar matriz (bulk)
GET    /matrices/comisiones               Matriz comisión por producto × perfil
PUT    /matrices/comisiones               Actualizar
POST   /simulador/otorgante               Simula con parámetros libres (para el dueño)
POST   /simulador/cotizador               Simula para mostrador (lenguaje accesible)
POST   /simulador/interno                 Simula para M02/M06 con perfil resuelto
POST   /productos/repricing               Repricing masivo con vista previa
POST   /productos/repricing/confirmar     Aplica el repricing (genera nuevas vigencias)

### BCRA

POST   /bcra/consultar/{persona_id}       Dispara consulta API BCRA y persiste resultado
GET    /bcra/{persona_id}/historial       Historial de consultas y deudas registradas
```

---

## 4. Stack y Arquitectura

### Backend
- **Python 3.12** + FastAPI + SQLAlchemy 2.0 (async) + Alembic + Pydantic v2
- **`nexocred_core`**: paquete Python puro, sin I/O, sin SQLAlchemy — solo clases, Decimal, y lógica financiera. Tests con Hypothesis (property-based). Este paquete es el corazón; los endpoints lo llaman.
- **Jobs**: Celery + Redis — devengo diario de punitorios, aging, snapshot_cartera, generación de rutas, workflows automatizados
- **PostgreSQL 18** (uuidv7 nativo). En 16/17: extensión `pg_uuidv7`
- **Índices clave**: BRIN sobre `created_at` en tablas de ledger (`pago`, `imputacion`, `movimiento_caja`, `comision_devengo`); GIN sobre `persona.apellido||nombre` para búsqueda rápida
- **Sin WhatsApp**: las notificaciones son internas (tareas CRM + alertas en La Torre)

### Frontend
- **React 18** + Vite + TypeScript
- **Design system**: Tailwind CSS + shadcn/ui (Radix primitives) — estética Stripe: modo claro, mucho aire, tipografía Inter, números protagonistas con Space Grotesk para KPIs
- **Datos**: TanStack Query v5
- **Tablas**: TanStack Table v8
- **Routing**: TanStack Router
- **Gráficos**: Tremor (sobre Recharts) para La Torre
- **Formularios**: React Hook Form + Zod
- **Paleta de comandos**: `cmdk` para ⌘K
- **La Ruta (PWA)**: mismo monorepo, Workbox para offline, SQLite/IndexedDB para cola local, UUIDv7 generado en dispositivo
- **Tipografía tabular**: `font-variant-numeric: tabular-nums` obligatorio en todo importe

### Infraestructura
- Docker Compose: `api`, `worker`, `beat`, `web` (nginx), `db` (postgres:18), `redis`
- Perfiles `dev` (hot-reload Vite) y `prod`
- Variables de entorno en `.env`
- `pg_dump` programado a volumen

---

## 5. Contratos de Dominio Obligatorios

### 5.0 Convencion de idioma

Los planes y documentacion tecnica pueden estar en ingles o espanol. La implementacion debe usar espanol para el negocio y aceptar ingles tecnico reconocido:

- Tablas, columnas, enums, constraints propias, endpoints y payloads de dominio usan nombres en espanol.
- Clases, funciones, modulos y tests de dominio usan nombres en espanol cuando representan conceptos de negocio (`Prestamo`, `Cuota`, `Pago`, `calcular_cronograma`, `aplicar_pago`).
- Textos visibles de UI, labels, errores funcionales y estados se muestran en espanol.
- Roles y permisos de negocio usan espanol (`admin`, `analista`, `cobrador`, `vendedor`, `operador`, `tesoreria`).
- Se permite ingles para terminos tecnicos usuales y reconocidos por el equipo/ecosistema, como `test`, `backend`, `frontend`, `endpoint`, `payload`, `healthcheck`, `seed`, `mock`, `fixture`, `snapshot`, `worker`, `job`, `lock`, `retry`, `deploy`, nombres de paquetes, herramientas, headers estandar, campos tecnicos universales y APIs de librerias.
- No traducir por purismo cuando el resultado suene artificial o menos claro. Por ejemplo, usar `test` en vez de `prueba` en paths/comandos/nombres tecnicos esta permitido.

La prioridad es consistencia y claridad: los conceptos de negocio deben conservar el mismo vocabulario en espanol entre base de datos, API, core y UI; los conceptos tecnicos pueden mantener el termino ingles habitual.

### 5.1 `nexocred_core` como frontera dura

`nexocred_core` es un paquete Python puro y deterministico. Esta prohibido importar FastAPI, SQLAlchemy, Celery, Redis, drivers de base de datos, variables de entorno o reloj del sistema dentro del paquete. Todas las fechas se reciben como parametros explicitos.

Responsabilidades incluidas:

- Normalizacion de importes con `Decimal`.
- Redondeo monetario a 2 decimales con politica unica.
- Generacion de cronogramas por interes directo.
- Calculo de saldo exigible por fecha de negocio.
- Waterfall de pagos.
- Tolerancia de cobro.
- Calculo de cancelacion total anticipada.
- Modelo puro de correccion: reversa total del pago original mas nuevo pago.
- Entradas de simulador para M15, M02 y M06.

Responsabilidades excluidas:

- Persistencia.
- Auditoria.
- Numeracion de documentos.
- Autenticacion o autorizacion.
- Consulta BCRA.
- Seleccion de caja.
- Envio de notificaciones.

### 5.2 Dinero y redondeo

- Todo importe de dominio se representa con `Decimal`.
- No se permite `float` en core, schemas de API, modelos ORM financieros ni seeds.
- El API serializa importes como `string` con 2 decimales.
- La base persiste dinero en `NUMERIC(p,2)` salvo tasas, porcentajes y matrices, que usan escala mayor.
- El redondeo monetario se hace con `ROUND_HALF_UP`.
- Cada funcion del core debe rechazar importes negativos salvo donde el tipo de evento sea explicitamente reversa, contra-asiento o ajuste.

### 5.3 Fecha de negocio

Toda operacion financiera usa `fecha_negocio`, no `now()` implicito:

- Pagos: fecha de imputacion contractual.
- Caja: fecha contable del movimiento.
- Punitorios y aging: fecha de corte.
- Snapshot cartera: fecha de corte.
- Rendicion: fecha de ruta.

Los timestamps `created_at` y `updated_at` son solo trazabilidad tecnica.

### 5.4 Waterfall de pagos

El orden obligatorio de imputacion es:

1. Punitorios vencidos.
2. Interes vencido.
3. Capital vencido.
4. Gastos/cargos exigibles, si existen.
5. Interes no vencido cuando el pago opera como cancelacion anticipada o novacion.
6. Capital no vencido cuando el pago opera como cancelacion anticipada o novacion.
7. Excedente no aplicado.

Cada imputacion debe registrar `pago_id`, `cuota_id` cuando corresponda, `concepto`, `monto`, `orden_waterfall` y `created_at`. El total imputado mas excedente debe ser exactamente igual al monto del pago.

### 5.5 Ocho casos borde minimos de §7.1

Hasta que el PRD v1.0 este disponible, estos 8 casos son el contrato minimo para cerrar Pre-F1:

1. **Pago exacto de cuota vencida:** liquida punitorio, interes y capital exigible sin excedente.
2. **Pago parcial menor al punitorio:** imputa todo a punitorio y deja interes/capital intactos.
3. **Pago parcial que cruza conceptos:** cancela punitorio completo, parte de interes y deja capital intacto.
4. **Pago mayor al exigible:** cancela deuda exigible y registra excedente no aplicado salvo que el modo sea cancelacion anticipada.
5. **Pago anticipado no cancelatorio:** no imputa contra cuotas no vencidas; queda como excedente/credito operativo.
6. **Cancelacion anticipada total:** calcula payoff a fecha de negocio e imputa contra interes/capital no vencido segun reglas del producto.
7. **Correccion 1 clic:** revierte todas las imputaciones y movimientos del pago original mediante contra-asientos, preserva trazabilidad y aplica el nuevo pago desde cero.
8. **Tolerancia de cobro:** si la diferencia contra la cuota exigible esta dentro de la tolerancia configurada, permite marcar la cuota como cerrada y registra ajuste de tolerancia; si excede la tolerancia, mantiene saldo pendiente.

Si el PRD contradice alguno de estos casos, gana el PRD y esta seccion debe actualizarse antes de implementar.

### 5.6 Maquinas de estado minimas

- `solicitud`: `borrador -> en_analisis -> aprobada|rechazada|desistida -> desembolsada`.
- `prestamo`: `vigente -> en_mora -> cancelado|novado|incobrable`. Solo se pueden registrar pagos sobre préstamos en estado `vigente` o `en_mora`; cualquier otro estado devuelve 409 `prestamo_no_cobrable`.
- `cuota`: `pendiente -> parcial -> pagada -> tolerada`; además `cancelada` cuando el préstamo es novado (las cuotas pendientes/parciales se cancelan en bloque al confirmar la novación). `vencida` es derivado por fecha, no estado persistido obligatorio.
- `pago`: `registrado -> aplicado|a_aplicar -> corregido`; un pago corregido no se edita.
- `caja`: movimientos append-only; arqueos diarios cierran periodos y no se reabren sin ajuste auditado.
- `rendicion`: `abierta -> presentada -> aprobada|observada`.
- `novacion`: `borrador -> confirmada -> anulada`; confirmar crea nuevo prestamo, cierra/relaciona origenes Y cancela todas las cuotas `pendiente`/`parcial` del préstamo origen.
- `documento_emitido`: vigente por defecto; `anulado_en` y `anulado_por` modelan anulacion.

Las transiciones invalidas deben devolver error de dominio estable, no excepciones genericas.

### 5.7 Idempotencia y concurrencia

Las operaciones financieras y offline deben ser idempotentes:

- `POST /solicitudes/{id}/desembolsar`
- `POST /pagos`
- `POST /pagos/{id}/corregir`
- `POST /prestamos/{id}/cancelar`
- `POST /novaciones/*`
- `POST /rutas/{id}/sync`
- `POST /comisiones/liquidaciones/{id}/pagar`
- `POST /documentos/generar`

El backend debe soportar `Idempotency-Key` para operaciones de mostrador/admin y UUIDv7 generado en dispositivo para La Ruta. En operaciones que cambian saldos se debe usar transaccion de base de datos y lock de las filas afectadas del prestamo/caja.

#### Reglas de locking (implementadas en `locking.py`)

Las siguientes operaciones deben adquirir un `SELECT ... FOR UPDATE` sobre la fila objetivo **antes** de cualquier validación de estado, para eliminar la ventana de carrera TOCTOU bajo concurrencia:

| Operación | Fila bloqueada | Función |
|-----------|---------------|---------|
| `desembolsar()` | `solicitud_credito` por `solicitud_id` | `bloquear_solicitud` |
| `corregir_uow()` | `prestamo` por `prestamo_id` del pago | `bloquear_prestamo` |
| `registrar_pago_uow()` | `prestamo` por `prestamo_id` | `bloquear_prestamo` |
| `pagar_liquidacion()` | `comision_liquidacion` por `liquidacion_id` | `bloquear_liquidacion` |
| Cualquier operación sobre caja | `caja` por `caja_id` | `bloquear_caja` |

Patrón de aplicación: adquirir lock → `session.refresh(objeto)` si el objeto fue cargado antes del lock → validar estado → ejecutar efecto. Nunca leer estado para decisiones de negocio sobre un objeto no bloqueado en rutas concurrentes.

#### Idempotency-Key en el frontend

La `Idempotency-Key` debe generarse una vez por intento de operación y rotarse en el frontend **solo tras éxito confirmado** por el servidor. En caso de error (timeout, 5xx, 4xx de negocio), el retry debe reutilizar la misma key. Esto garantiza que el backend pueda deduplicar reintentos sin bloquear segundas operaciones legítimas desde la misma sesión.

### 5.8 Auditoria minima

Debe auditarse, como minimo:

- Login, logout y refresh fallido.
- Alta, baja logica y cambio de roles de usuario.
- Alta y modificacion de persona.
- Sync BCRA.
- Evaluacion, aprobacion, rechazo y desembolso de solicitud.
- Registro, aplicacion y correccion de pago.
- Movimiento manual de caja, transferencia interna y arqueo.
- Novacion confirmada.
- Generacion y anulacion de documento.
- Resolucion/asignacion de alerta.
- Cambios de parametros globales, productos, tasas y matrices.

Cada evento debe incluir actor, accion, entidad, entidad_id, timestamp, ip/user-agent si existe, diff o metadata relevante, y resultado.

### 5.11 Control de acceso y ownership

Más allá del RBAC por rol (§5.8/M12), los endpoints de campo aplican reglas de **ownership**:

#### Rendiciones — separación de roles

`PATCH /rendiciones/{id}` con `estado=aprobada` requiere que el actor **no sea el mismo cobrador** que generó la rendición. Un cobrador puede presentar su propia rendición (`estado=presentada`) pero no aprobarla. La aprobación requiere rol `admin` o un cobrador distinto con permisos de supervisión. Violación devuelve 403 `aprobacion_propia_no_permitida`.

#### Rutas — ownership estricto

Los endpoints `visitar`, `sync` y `detalle` de una ruta verifican que `ruta.cobrador_id == actor.id`. Un cobrador con rol válido no puede operar sobre la ruta de otro cobrador. Los usuarios con rol `admin` están exentos. Violación devuelve 403 `acceso_denegado`.

#### Navegación post-login (`fallbackRoute`)

Tras autenticarse, cada rol aterriza en su ruta funcional primaria. No existe un destino único `/personas` para todos:

| Rol | Ruta de aterrizaje |
|-----|--------------------|
| `cobrador` | `/ruta` |
| `tesoreria` | `/tesoreria` |
| `vendedor` | `/solicitudes` |
| `operador` | `/crm/inbox` |
| `analista` | `/personas` |
| `admin` | `/personas` |

Redirigir a un destino inaccesible para el rol del usuario genera un loop infinito de guards. La función `fallbackRoute(roles)` en `guards.ts` encapsula esta tabla y debe usarse tanto en `enforceRoles` como en el redirect post-login del router.

### 5.9 BCRA

BCRA se implementa detras de un puerto/adaptador:

- `FakeBcraClient` para desarrollo y tests.
- `HttpBcraClient` para integracion real.

La aprobacion de solicitud queda bloqueada si la persona no tiene una consulta BCRA registrada con `fecha_informe` vigente segun parametro global `bcra_vigencia_dias`. El alta de persona no se bloquea por BCRA.

### 5.10 Documentos

M13 es opt-in, pero el sistema debe distinguir dos niveles:

- **Metadata minima desde F1b:** pagos y prestamos pueden listar documentos esperados o generados.
- **Generacion real desde F1d:** PDF, hash SHA-256, correlativo por tipo, storage y anulacion.

La numeracion por tipo debe ser transaccional y resistente a concurrencia.

---

## 6. Orden de Construcción (Enfoque A — Motor primero)

### Pre-F1 (semanas 1–2): `nexocred_core` cerrado y testeado
Motor financiero puro. Ningún endpoint ni pantalla hasta que esto esté verde con Hypothesis.

### F1a (semanas 3–5): DDL + Backend base + M15 + M01
- Migraciones Alembic completas con el DDL de este spec
- M12: auth JWT, RBAC, auditoría
- M15: catálogo, perfiles, matrices, simuladores
- M01: personas, referencias, BCRA sync

### F1b (semanas 6–8): Motor de pagos en producción
- M02: originación, scoring, oferta, desembolso
- M03: préstamos, cronogramas, payoff
- M04: caja, pagos, waterfall completo, corrección 1 clic, tolerancia
- M06: novaciones (refinanciación + consolidación + transferencia + Repactar rápido)

### F1c (semanas 9–11): Campo + CRM + Comercial + Riesgo
- M05: La Ruta, rendición, descargos, sync offline
- M08: CRM 360, tareas, incidentes, timeline
- M09: comisiones, clawback, liquidaciones, portal vendedor
- M07: riesgo, motor de alarmas

### F1d (semana 12): La Torre + Tesorería + Workflows
- M10: tesorería, cashflow, DCF
- M11: La Torre completa con snapshot_cartera
- §7.2: workflows automatizados A y B (sin WhatsApp, con tareas internas)
- M13: documentos opt-in

### Frontend (paralelo desde semana 3)
- Semanas 3–4: design system, componentes base, layout sidebar/header, paleta de comandos ⌘K
- Semanas 5–8: pantallas F1a y F1b en paralelo al backend
- Semanas 9–12: pantallas F1c y F1d + La Ruta PWA

---

## 7. Planes de Implementacion Requeridos

El POC no debe ejecutarse desde un unico plan gigante. Debe dividirse en planes hijos, cada uno con software verificable al final:

1. `Pre-F1`: `nexocred_core` cerrado con tests unitarios, golden y property-based.
2. `F1a Backend`: schema base, migraciones, M12 minimo, M15, M01 y BCRA adapter.
3. `F1b Backend`: M02, M03, M04 y M06 integrados con el core.
4. `F1c Backend`: M05, M08, M09 y M07.
5. `F1d Backend`: M10, M11, workflows y M13.
6. `Frontend Foundation + F1a/F1b`: shell, design system, auth, personas, catalogo, originacion, prestamos, caja y pagos.
7. `Frontend F1c/F1d + PWA`: La Ruta offline, CRM, riesgo, comisiones, tesoreria, Torre y documentos.
8. `Hardening`: seeds, jobs programados, observabilidad, backups, demo script y pruebas end-to-end.

Cada plan hijo debe incluir:

- Archivos exactos a crear/modificar.
- Pasos TDD con tests fallando primero.
- Comandos exactos y salida esperada.
- Criterios de aceptacion.
- Riesgos que quedan fuera de alcance.

---

## 8. Riesgos mitigados

| Riesgo original | Mitigación en este spec |
|---|---|
| WhatsApp bloquea el critical path | Eliminado completamente |
| Identidad progresiva compleja en POC | Eliminada; CUIL único obligatorio |
| Motor financiero con bugs tardíos | Pre-F1 dedicado con Hypothesis antes de cualquier UI |
| DDL incompleto | Completado en §2 de este spec |
| Ausencia de contratos API | Definidos en §3 de este spec |
| La Torre sin datos hasta que corre el job | `snapshot_cartera` se puede disparar on-demand desde admin + job nocturno |
| `parada_id` sin FK | FK explícita nullable declarada en `parada_ruta` |
| Workflows sin canal de mensajería | Generan tareas CRM internas y alertas en La Torre |

---

## 9. Riesgos abiertos que el plan debe controlar

| Riesgo abierto | Control requerido |
|---|---|
| PRD v1.0 no disponible en el workspace | La spec define contratos minimos; si aparece el PRD, reconciliar antes de Pre-F1 y F1a |
| DDL base no enumerado completo | Primer plan F1a debe inventariar tablas base antes de migrar |
| Frontend paralelo contra APIs inestables | Congelar OpenAPI por etapa y usar cliente tipado/mocks contractuales |
| PWA offline subestimada | Plan separado para La Ruta con cola local, idempotencia, retry y reconciliacion |
| Concurrencia financiera | Locks transaccionales e idempotency keys obligatorios |
| Jobs cambian saldos sin fecha clara | Usar `fecha_negocio` explicita en jobs y endpoints financieros |
| M12 demasiado grande para F1a | F1a implementa M12 minimo; administracion avanzada pasa a hardening si no bloquea flujo |

---

---

## Historial de revisiones

| Fecha | Cambios |
|-------|---------|
| 2026-06-11 | Versión inicial. Spec base del POC. |
| 2026-06-13 | §5.6: estado `cancelada` en `cuota` y semántica de novación. §5.7: tabla de locking obligatorio + regla de rotación de Idempotency-Key en frontend. §5.11 (nuevo): ownership de rutas, separación cobrador/aprobador en rendiciones, `fallbackRoute` por rol. §3 M05: notas de ownership en endpoints. Basado en auditoría `AUDITORIA_CODIGO_2026-06-12.md`, críticos C1–C8 resueltos. |
