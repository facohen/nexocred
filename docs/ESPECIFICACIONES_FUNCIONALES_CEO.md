# NexoCred — Especificaciones Funcionales

### Documento ejecutivo orientado a Dirección

**Versión:** 1.0 · **Fecha:** 13 de junio de 2026 · **Estado del producto:** Release Candidate (POC completo)

---

## 1. Resumen ejecutivo

**NexoCred es la plataforma operativa integral de una financiera de microcrédito y crédito al consumo.** Cubre el ciclo completo del negocio en un solo sistema: desde que se da de alta a un cliente, pasando por la evaluación y el otorgamiento del préstamo, la cobranza en la calle y en el mostrador, hasta el control de riesgo, la tesorería y el tablero de comando de la dirección.

El objetivo del producto es **reemplazar la combinación de planillas, sistemas aislados y procesos manuales** con los que típicamente opera una financiera, y reunir en una única fuente de verdad la cartera, la caja y la relación con cada cliente.

Tres principios guían todo el sistema:

1. **El dinero nunca se distorsiona.** Todos los cálculos financieros se hacen con precisión exacta (sin errores de redondeo de centavos), bajo un único motor de cálculo auditado y probado contra cientos de escenarios.
2. **Todo queda registrado y es auditable.** Cada pago, corrección, aprobación y cambio de parámetro deja rastro de quién lo hizo, cuándo y qué cambió.
3. **El negocio se opera donde sucede.** El cobrador trabaja en la calle aunque no tenga señal; el analista evalúa desde su escritorio; el dueño ve el pulso del negocio en tiempo real desde un solo tablero.

> **Estado actual:** la prueba de concepto (POC) está completa y verificada como *Release Candidate*. Todos los módulos del alcance fueron entregados, probados y auditados. Ver §9 para el detalle de madurez y los puntos pendientes de decisión.

---

## 2. El problema que resuelve

Una financiera de microcrédito vive de tres tensiones permanentes:

| Tensión | Cómo se vive sin sistema | Cómo lo resuelve NexoCred |
|---|---|---|
| **Cobrar a tiempo** | El cobrador en la calle no tiene visibilidad de la deuda exacta; los pagos se anotan en papel y se cargan tarde o con errores. | "La Ruta": app móvil que funciona **sin conexión**, con la deuda exacta de cada cliente y registro del cobro en el momento. |
| **No prestar de más ni de menos** | La evaluación depende del criterio de cada analista; no hay control consistente de políticas. | Originación con scoring interno, validación automática de políticas (edad, relación cuota/ingreso, BCRA, mora previa) y simulación de oferta en vivo. |
| **Saber dónde está la plata** | La posición de caja y de capital se arma "a mano" a fin de mes; el riesgo se descubre tarde. | Tesorería y riesgo en tiempo real, con tablero de dirección ("La Torre") que consolida todo el negocio. |

El resultado buscado: **menos pérdida por mora, decisiones de crédito más consistentes, y visibilidad total del capital y la cartera.**

---

## 3. Capacidades del producto (por área de negocio)

A continuación, qué puede hacer el sistema, agrupado por el área de la empresa que lo usa.

### 3.1 Clientes y relación (CRM 360)

- **Ficha de cliente completa y única:** datos personales, domicilio (con indicaciones de fachada para el cobrador), ingresos declarados y en blanco, contactos de referencia y datos laborales. Cada persona se identifica de forma única por su CUIL, validado automáticamente.
- **Vista 360° del cliente:** todos sus préstamos (como deudor y como garante), su historial de pagos, sus interacciones, sus incidentes y su deuda informada en el BCRA, en una sola pantalla con línea de tiempo unificada.
- **Consulta BCRA integrada:** el analista dispara la consulta a la central de deudores; el resultado queda registrado y **es requisito para aprobar** un crédito (pero no para dar de alta al cliente).
- **CRM operativo:** bandeja de tareas por operador, incidentes, registro de interacciones (llamadas, visitas), pipeline de prospectos y asignación de clientes a operadores.

### 3.2 Otorgamiento de crédito (Originación)

- **Catálogo de productos de crédito** con versiones, perfiles de pricing y matrices de tasa y comisión por producto, perfil y plazo.
- **Simuladores** para tres públicos: el dueño (parámetros libres), el mostrador (lenguaje accesible para el cliente) y el motor interno de evaluación.
- **Flujo de solicitud** con scoring interno, asignación automática de perfil de pricing y **checklist de políticas** (edad, relación cuota/ingreso, BCRA vigente, mora previa).
- **Desembolso en un paso** que crea el préstamo, congela las condiciones de forma inmutable, genera el cronograma de cuotas, impacta la caja y devenga la comisión del vendedor — todo de forma atómica y a prueba de doble-desembolso.

### 3.3 Préstamos y pagos (el corazón financiero)

- **Cronograma de amortización** por interés directo, con saldos exigibles calculados a cualquier fecha.
- **Motor de pagos con orden de imputación profesional:** cada pago se aplica en el orden correcto (punitorios → interés → capital, cuota más vieja primero), maximizando la cobertura de mora antes de amortizar capital. Esto protege el rendimiento de la cartera y es lo que esperan auditoría y el regulador.
- **Pagos parciales, anticipados y cancelaciones totales** correctamente diferenciados; el sistema calcula el monto exacto de cancelación ("payoff") a cualquier fecha.
- **Corrección en 1 clic:** un cobro mal registrado se revierte con contra-asiento (sin borrar el original, preservando la trazabilidad) y se vuelve a aplicar desde cero.
- **Tolerancia de cobro configurable:** diferencias menores de centavos cierran la cuota automáticamente registrando el ajuste, sin dejar saldos "fantasma".

### 3.4 Cobranza de campo ("La Ruta")

- **App móvil offline-first:** el cobrador recibe su ruta del día con la deuda exacta de cada parada y **opera sin conexión** en zonas sin señal.
- **Cola idempotente:** cada cobro se estampa con un identificador único de dispositivo y se sincroniza después sin riesgo de duplicar cobros, incluso si el celular pierde conexión a mitad de la operación.
- **Captura de resultado de visita:** pago, pago parcial, promesa, ausente, se niega, con foto y geolocalización.
- **Rendición del día con descargos** (gastos de campo) y separación de roles: **el cobrador presenta su rendición pero no puede aprobarla** — la aprobación requiere un supervisor o administrador.

### 3.5 Reestructuración de deuda (Novaciones)

- **Refinanciación** (1 préstamo → 1 nuevo), **consolidación** (varios → 1), **transferencia** de deuda a un nuevo deudor y **"Repactar rápido"** para renegociar cuota y periodicidad.
- Al confirmar una novación, el préstamo original se cierra correctamente y sus cuotas pendientes se cancelan en bloque — **no queda un préstamo "zombi" cobrable** por error.
- Trazabilidad completa de la cadena de novaciones de cualquier préstamo.

### 3.6 Caja y tesorería

- **Múltiples cajas y cuentas** con ledger append-only (no se borra, se corrige con asientos), arqueo diario teórico vs. físico, transferencias internas y posición consolidada.
- **Tesorería:** capital disponible y utilización con semáforo, proyección de flujo de caja a 30/60/90 días, valuación de cartera (DCF) con escenarios, rotación de capital, y registro de aportes y retiros de capital.

### 3.7 Riesgo y alarmas

- **Tablero de riesgo:** PAR 30/60/90, aging de cartera, % refinanciado, pérdida esperada.
- **Curvas de cosecha (vintage)** por mes de originación y análisis de **concentración** por cliente, zona, vendedor y producto.
- **Motor de alarmas** con bandeja de alertas activas, asignación a operadores y resolución justificada.
- **Workflows automáticos** que, ante eventos como mora a 1/3/7/30 días, generan tareas e incidentes internos automáticamente (sin depender de canales externos de mensajería).

### 3.8 Equipo comercial (Vendedores)

- **Comisiones** devengadas por desembolso, con **clawback** (reversión si el crédito se cae), liquidaciones por período (generar → aprobar → pagar con egreso de caja).
- **Portal del vendedor:** su cartera originada con estado y mora, su pipeline de solicitudes y sus comisiones.

### 3.9 Tablero de dirección ("La Torre")

El centro de comando del dueño/CEO, con:

- **Pulso del negocio:** tarjetas de número grande con los indicadores clave del momento.
- **Salud de cartera:** aging, cosechas, cashflow, pérdida esperada.
- **Operación de hoy:** cobranza del día, rutas, promesas, pipeline comercial.
- **Negocio:** colocación, rendimiento, rankings (tops).
- **Alertas en vivo** con enlaces directos al punto exacto que requiere atención.

### 3.10 Administración, seguridad y documentos

- **Usuarios y roles** (admin, analista, cobrador, vendedor, operador, tesorería) con permisos por rol y **cada rol aterriza en su pantalla de trabajo** al ingresar.
- **Auditoría completa:** login/logout, altas y cambios de usuarios y personas, consultas BCRA, evaluaciones y desembolsos, pagos y correcciones, movimientos de caja, novaciones, documentos y cambios de parámetros — siempre con actor, fecha, entidad y qué cambió.
- **Documentos** (recibos, cronogramas, mutuos, pagarés, conformidades de novación) con numeración correlativa única, hash de inmutabilidad y anulación controlada con motivo.

---

## 4. Roles y cómo trabaja cada uno

| Rol | Qué hace en NexoCred | Dónde empieza su día |
|---|---|---|
| **Administrador** | Configura productos, parámetros, usuarios; supervisa todo. | Personas / La Torre |
| **Analista** | Evalúa y aprueba solicitudes; gestiona fichas de cliente. | Personas |
| **Vendedor** | Origina solicitudes; sigue su cartera y comisiones. | Solicitudes |
| **Cobrador** | Recorre su ruta, cobra en la calle, rinde el día. | La Ruta |
| **Operador (CRM)** | Atiende tareas, incidentes e interacciones con clientes. | Inbox de CRM |
| **Tesorería** | Controla capital, flujo de caja y posición. | Tesorería |

La **separación de funciones** está garantizada por diseño: un cobrador no puede aprobar su propia rendición ni operar la ruta de otro cobrador; las acciones sensibles requieren el rol adecuado.

---

## 5. Diferenciadores clave (por qué este sistema y no una planilla)

1. **Motor financiero auditado.** Toda la lógica de dinero vive en un único componente probado con cientos de escenarios automáticos. No hay fórmulas dispersas en planillas distintas que se contradicen.
2. **Cobranza que no se detiene sin señal.** "La Ruta" es offline-first de verdad: el cobrador trabaja, el sistema reconcilia después sin duplicar nada.
3. **Imposible cobrar o desembolsar dos veces por error.** Las operaciones financieras críticas están protegidas contra duplicados, incluso bajo reintentos de red o doble-tap en el celular.
4. **Trazabilidad total.** El ledger de pagos no se borra; se corrige. Cada movimiento tiene autor y motivo.
5. **Visibilidad de dirección en tiempo real.** "La Torre" reúne el pulso de cobranza, riesgo, tesorería y comercial en una sola pantalla.

---

## 6. Decisiones de negocio ya tomadas (por estándar de industria)

Tres definiciones operativas fueron resueltas según la práctica habitual del sector (microfinanzas, AR/LatAm). Cada una es un parámetro acotado y barato de cambiar si la financiera quiere apartarse del estándar:

| Decisión | Resolución adoptada | Por qué |
|---|---|---|
| **Orden de imputación de pagos** | Punitorios → interés → capital, cuota más vieja primero. | Maximiza cobertura de mora en pagos parciales; es el orden legal y esperado por auditoría. |
| **Excedente de pago** | Queda como **saldo a favor** del cliente; no amortiza capital de oficio. | Evita disputas y violar cláusulas de precancelación. La amortización anticipada existe, pero solo de forma explícita. |
| **Operación offline** | El cobrador en la calle opera offline; el mostrador requiere conexión. | El cobro puerta a puerta lo exige; el mostrador no debe encolar a ciegas. |

---

## 7. Fuera de alcance (consciente)

Para acotar el POC y no comprometer el camino crítico, **se excluyeron deliberadamente**:

- **WhatsApp Business API.** Las notificaciones de cobranza se manejan como tareas e incidentes internos del CRM, no por mensajería externa.
- **Identidad progresiva** (niveles de cliente por monto, deduplicación heurística). Se reemplazó por una ficha con CUIL único obligatorio, más simple y robusta.

Estas exclusiones reducen riesgo y complejidad; ambas pueden incorporarse en una fase posterior si el negocio lo justifica.

---

## 8. Cómo se construyó (resumen para contexto)

El producto se construyó con un enfoque "motor primero": **el corazón financiero se cerró y probó exhaustivamente antes de construir cualquier pantalla.** Sobre esa base se levantaron, por etapas, el backend de cada área, las pantallas, la app de campo y finalmente el endurecimiento (hardening), seeds de demostración, jobs programados y backups.

El sistema es **multiplataforma** (web para escritorio + app instalable tipo PWA para el campo) y está empaquetado para desplegarse de forma reproducible.

---

## 9. Estado de madurez y puntos abiertos

### 9.1 Qué está entregado y verificado

Todos los módulos del alcance (M01 a M15) están **entregados, probados y auditados**:

- Verificación funcional completa: el ciclo de vida de un préstamo (alta → desembolso → cobro → cierre) corre de punta a punta **conservando el dinero exactamente** (cada ingreso y egreso mueve la posición de caja en el monto correcto).
- **Auditoría de seguridad y correctitud** sobre todo el código: se identificaron 8 problemas críticos (doble desembolso, doble cobro, préstamo novado aún cobrable, cobrador aprobando su propia rendición, acceso a rutas ajenas, doble liquidación de comisiones, entre otros) y **los 8 fueron corregidos y verificados**.

### 9.2 Puntos pendientes de decisión de la dirección

Tres definiciones quedan abiertas a sign-off de producto (la opción más consistente ya está implementada, ver §6):

1. **Confirmar el orden exacto de imputación del waterfall** contra la política definitiva de la financiera.
2. **Confirmar el tratamiento del excedente** (saldo a favor vs. amortización automática).
3. **Definir si el mostrador debe operar también offline-estricto** o permanece online.

### 9.3 Limitaciones conocidas del POC

- **Reconstrucción histórica de riesgo "como era" en una fecha pasada arbitraria:** diferida. El riesgo se calcula a fecha de corte sobre el estado actual; la historización disponible son los snapshots persistidos.
- **Aporte/retiro de capital sin formulario en la interfaz:** el motor existe y está probado; falta solo la pantalla.
- **Pruebas automáticas de navegador (end-to-end visual):** fuera de alcance del POC; la cobertura end-to-end es de backend completo más smoke de frontend.

---

## 10. Próximos pasos sugeridos

1. **Sign-off de las 3 decisiones de negocio abiertas** (§9.2) — son rápidas de cerrar y desbloquean la operación definitiva.
2. **Definir el plan de datos reales:** migración de la cartera existente y de los clientes a la ficha única por CUIL.
3. **Priorizar las mejoras post-POC:** formulario de aporte/retiro, reconstrucción histórica de riesgo, y reincorporación selectiva de notificaciones (WhatsApp) si el negocio lo pide.
4. **Plan de puesta en producción:** infraestructura, backups, capacitación por rol y piloto controlado con un equipo de cobranza.

---

*Documento preparado para Dirección. Para el detalle técnico, ver `docs/superpowers/specs/2026-06-11-nexocred-poc-design.md` (spec de diseño), `docs/RELEASE_NOTES.md` (estado de entrega) y `docs/DECISIONES_NEGOCIO.md` (fundamentación de las decisiones de §6).*
