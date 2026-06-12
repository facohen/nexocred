# Auditoria anti-mocks-permisivos (Stage 8 — Task 6)

Objetivo: barrer ambas suites buscando mocks de fantasia / permisivos —
tests que (a) mockean la propia unidad bajo prueba, (b) afirman sobre el
return de un mock en vez del comportamiento real, (c) usan un fake de
BCRA/storage/reloj tan laxo que la aseveracion nunca puede fallar, o
(d) parchean un servicio a una constante que evita la logica que se
afirma probada. Cada hallazgo lleva un veredicto y, si era debil, se
endurecio para que FALLE ante una regresion plausible.

## Metodologia

- Barrido backend: `grep -rn` por `unittest.mock`, `MagicMock`, `AsyncMock`,
  `monkeypatch`, `.return_value`, `assert_called`.
- Barrido frontend: `grep -rn` por `vi.mock`, `vi.fn`, `mockResolvedValue`,
  `mockReturnValue`, `toHaveBeenCalled`, `mockImplementation`.
- Criterio de "buen fake de borde": el fake reemplaza un LIMITE externo
  (cliente HTTP BCRA, ServiceWorkerRegistration, router de la SPA, red via
  MSW) y la aseveracion mira el comportamiento del codigo PROPIO alrededor
  del fake (DOM renderizado, fila persistida en DB, dinero conservado),
  no el valor que el fake devuelve.

## Hallazgos — Backend

La suite backend corre contra una Postgres real (DB de test migrada con
alembic) y un unico fake de borde determinista (`FakeBcraClient`). No usa
`unittest.mock`. El unico parche encontrado es una INYECCION DE FALLA
legitima.

| Test | Construccion | Veredicto |
|---|---|---|
| `integration/test_payoff_cancelacion.py::test_cancelacion_atomica_falla_no_persiste_nada` | `monkeypatch.setattr(prestamos_srv, "escribir_evento", _boom)` | LEGITIMO. Inyecta un fallo en medio de la UoW y AFIRMA sobre el estado REAL de la DB (0 pagos, 0 movimientos, estado != cancelado) tras el rollback. No afirma sobre el mock. Catch-y-verifica atomicidad real. Sin cambios. |
| `api/test_bcra.py` (+ usos de `FakeBcraClient` en integracion) | Fake de borde BCRA deterministico | LEGITIMO. Las aseveraciones miran la fila `persona_deuda_bcra` PERSISTIDA, el evento de auditoria `bcra_sync`, y el rango `1..6` de situacion. `test_fake_bcra_determinista` ademas fija el contrato del fake (mismo CUIL -> mismo resultado). El codigo de sincronizacion (servicio) se ejerce de punta a punta. Sin cambios. |
| Resto de la suite (api/integration/services/core) | Sin mocks; DB real + funciones puras del core | LEGITIMO. Conservacion de dinero, waterfall, idempotencia y snapshots se afirman sobre filas reales. Sin cambios. |

Conclusion backend: **0 mocks permisivos.** La suite ya prueba el codigo
alrededor de su unico fake de borde.

## Hallazgos — Frontend

La red se fake-ea con MSW (handlers con forma HTTP real); el router de la
SPA y la API de Background Sync se fake-ean por ser limites del navegador.
Las aseveraciones miran el DOM renderizado y los efectos reales (token
guardado, header enviado, boton deshabilitado). Dos tests tenian
aseveraciones que podian no fallar ante una regresion plausible; se
endurecieron.

| Test | Construccion | Veredicto / Accion |
|---|---|---|
| `features/pagos/pagos.test.tsx` "envia el header Idempotency-Key" | MSW captura el header; antes solo `expect(seenKey).toBeTruthy()` | ENDURECIDO. Una regresion que mandara un literal fijo igual pasaba `toBeTruthy`. Ahora se afirma que el key matchea un UUID crypto (o el fallback `idem-*`): un placeholder vacio o constante HACE FALLAR el test. |
| `features/ruta/sw-sync.test.ts` "registra el sync tag" | `vi.fn()` como `register` de un `ServiceWorkerRegistration` fake; afirmaba `toHaveBeenCalledWith("ruta-sync")` | LEGITIMO pero REFORZADO. El fake es un limite del navegador (no la unidad). La aseveracion verifica el TAG EXACTO que el SW de produccion escucha (catch a un cambio de tag) + `toHaveBeenCalledTimes(1)`. Se AGREGO un test del camino de rechazo (`mockRejectedValue`) que afirma `resolves.toBe(false)`: si una regresion deja escapar la excepcion, el test falla. |
| `features/auth/login.test.tsx` | MSW + `onSuccess` callback prop | LEGITIMO. Afirma onSuccess llamado Y `getToken().access_token` truthy (efecto real via session/auth real). Sin cambios. |
| `features/solicitudes/*`, `caja`, `personas`, `catalogo`, `novaciones`, `prestamos`, `commandpalette` | `vi.mock("@tanstack/react-router")` (limite) + MSW | LEGITIMO. Afirman DOM real: botones deshabilitados, checklist, sobres de error en espaniol, money strings (`$ 41.666,67`). Sin cambios. |

Conclusion frontend: **2 aseveraciones endurecidas**, el resto ya prueba
comportamiento real alrededor de fakes de borde legitimos.

## Resultado

- Backend: sin cambios necesarios (suite sana). Re-corrida completa verde.
- Frontend: 2 tests endurecidos (`pagos` Idempotency-Key, `sw-sync` tag +
  camino de rechazo). Re-corrida completa verde.
- Se mantienen los fakes de borde legitimos (FakeBcraClient, MSW, router,
  ServiceWorkerRegistration); en todos los casos la aseveracion ejerce el
  codigo PROPIO que rodea al fake.

---

# Auditoria de botones transaccionales (Stage 8 — Task 7)

`TransactionButton` (`src/components/TransactionButton.tsx`) envuelve el
`Button` y, mientras `pending`, lo deja `disabled` + `aria-busy` + muestra un
spinner. El primer click previene un segundo submit del mismo mutador.

Barrido de las pantallas y sus acciones que MUEVEN dinero/estado:

| Pantalla | Accion critica | Guarda |
|---|---|---|
| `pagos/RegistrarPagoPage` | registrar pago | TransactionButton (`registrar.isPending`) |
| `pagos/CorreccionDialog` | corregir pago | TransactionButton (`corregir.isPending`) |
| `solicitudes/SolicitudDetailPage` | aprobar y desembolsar | TransactionButton (`accion.isPending`) + gating checklist/BCRA |
| `documentos/DocumentosPage` | generar documento | TransactionButton (`generar.isPending`) |
| `vendedores/LiquidacionesPage` | liquidacion pagar | TransactionButton (`pagar.isPending && variables===id`) |
| `vendedores/LiquidacionesPage` | generar liquidacion | TransactionButton (`generar.isPending`) |
| `ruta/RutaPage` | sincronizar (cobros offline) | TransactionButton (`sincronizando`) |

Acciones no presentes en la UI del POC (no requieren guarda de boton):

- aporte/retiro de tesoreria: existe el endpoint backend pero el
  `TesoreriaDashboard` es read-only (sin formulario de mutacion). Si se
  agrega el formulario, debe usar `TransactionButton` (registrado como
  pendiente en RELEASE_NOTES).
- `ruta/VisitaCaptureForm` "Guardar visita": solo ENCOLA localmente
  (IndexedDB) de forma sincrona; el POST del cobro lo hace el boton
  Sincronizar (ya guardado). No hay mutacion en vuelo en el guardar.

Tests: `components/transactionbutton.test.tsx` (disable+spinner+anti-doble-submit)
y `features/transactional-buttons.test.tsx` (un test por accion critica que
afirma el boton DESHABILITADO con la mutacion en vuelo via handler MSW demorado).
