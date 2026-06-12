# Fix 8 Críticos de Auditoría — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar los 8 hallazgos críticos de la auditoría 2026-06-12: doble desembolso, doble corrección de pago, préstamo novado cobrable, doble comisión, cobrador auto-aprueba, IDOR de rutas, key de idempotencia no rota, doble-tap en visita, redirect infinito en login.

**Architecture:** Tres grupos paralelizables — A: fixes de locks y constraints en backend (C1/C2/C3/C5), B: fixes de control de acceso en backend (C4a/C4b), C: tres fixes de frontend (C6/C7/C8). Cada tarea usa TDD estricto (test rojo → implementación → test verde → commit).

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy async, asyncpg, Alembic, pytest-asyncio; React 18, TypeScript, Vitest, MSW, Testing Library.

---

## Archivos que se tocan

### Backend
- `backend/app/modelos_stub.py` — agregar `UniqueConstraint` en `Prestamo` (C1)
- `backend/app/locking.py` — agregar `bloquear_solicitud` y `bloquear_liquidacion` (C1, C5)
- `backend/app/m02_originacion/servicio_desembolso.py` — adquirir lock de solicitud antes del check (C1)
- `backend/app/m04_pagos/servicio.py` — mover lock antes del check de estado (C2); guard de estado de préstamo (C3)
- `backend/app/m06_novaciones/servicio.py` — cerrar cuotas al novar (C3)
- `backend/app/m09_comisiones/servicio.py` — excluir devengos ya liquidados (C5A); lock de liquidación (C5B)
- `backend/app/m05_ruta/servicio.py` — guard: cobrador no aprueba su rendición (C4a)
- `backend/app/m05_ruta/router.py` — helper `_get_ruta_propia` + IDOR check (C4b)
- `backend/alembic/versions/0006_criticos.py` — unique index en `prestamo.solicitud_id` (C1)
- `backend/tests/integration/test_criticos_backend.py` — nuevo archivo de tests (C1/C2/C3/C5/C4)

### Frontend
- `frontend/src/features/pagos/RegistrarPagoPage.tsx` — rotar key tras éxito (C6)
- `frontend/src/features/ruta/VisitaCaptureForm.tsx` — IDs en estado, TransactionButton (C7)
- `frontend/src/routes/guards.ts` — `fallbackRoute()` + `enforceRoles` corregido (C8)
- `frontend/src/routes/router.tsx` — post-login redirect usando `fallbackRoute` (C8)
- `frontend/src/features/pagos/RegistrarPagoPage.test.tsx` — nuevo (C6)
- `frontend/src/features/ruta/VisitaCaptureForm.test.tsx` — nuevo (C7)
- `frontend/src/routes/guards.test.ts` — ampliar tests existentes (C8)

---

## GRUPO A: Backend — Locks y Constraints

---

### Task 1: [C1] Migración + constraint en modelo Prestamo

**Files:**
- Modify: `backend/app/modelos_stub.py` (clase `Prestamo`, `__table_args__`)
- Create: `backend/alembic/versions/0006_criticos.py`

- [ ] **Step 1: Agregar UniqueConstraint al modelo**

En `backend/app/modelos_stub.py`, en la clase `Prestamo` (que actualmente no tiene `__table_args__`), agregar después del último campo:

```python
# al final de class Prestamo(Base):
    __table_args__ = (
        UniqueConstraint("solicitud_id", name="prestamo_solicitud_uq"),
    )
```

`UniqueConstraint` ya está importada al inicio del archivo (línea 23).

- [ ] **Step 2: Crear migración**

Crear `backend/alembic/versions/0006_criticos.py`:

```python
"""Criticos auditoria 2026-06-12 — unique parcial en prestamo.solicitud_id.

Un prestamo puede existir sin solicitud_id (novaciones), por eso el index es
parcial: solo aplica donde solicitud_id IS NOT NULL.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0006_criticos"
down_revision: str | None = "0005_snapshot_nn"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        sa.text(
            "CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS prestamo_solicitud_uq "
            "ON prestamo(solicitud_id) WHERE solicitud_id IS NOT NULL"
        )
    )


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS prestamo_solicitud_uq"))
```

- [ ] **Step 3: Correr la migración para verificar que aplica**

```bash
conda run -n nexocred alembic -c backend/alembic.ini upgrade head
```

Resultado esperado: `Running upgrade 0005_snapshot_nn -> 0006_criticos`.

- [ ] **Step 4: Commit**

```bash
git add backend/app/modelos_stub.py backend/alembic/versions/0006_criticos.py
git commit -m "feat(db): unique parcial en prestamo.solicitud_id — previene doble desembolso (C1)"
```

---

### Task 2: [C1] Lock de solicitud antes del check en desembolsar

**Files:**
- Modify: `backend/app/locking.py`
- Modify: `backend/app/m02_originacion/servicio_desembolso.py`
- Create: `backend/tests/integration/test_criticos_backend.py`

- [ ] **Step 1: Agregar bloquear_solicitud a locking.py**

En `backend/app/locking.py`, agregar al final:

```python
from app.modelos_stub import SolicitudCredito


def _stmt_solicitud_for_update(solicitud_id: uuid.UUID) -> Select:
    return select(SolicitudCredito).where(SolicitudCredito.id == solicitud_id).with_for_update()


async def bloquear_solicitud(session: AsyncSession, solicitud_id: uuid.UUID) -> "SolicitudCredito":
    res = await session.execute(_stmt_solicitud_for_update(solicitud_id))
    sol = res.scalar_one_or_none()
    if sol is None:
        raise ErrorAPI("solicitud_no_encontrada", "solicitud inexistente", status=404)
    return sol
```

- [ ] **Step 2: Escribir el test que falla primero**

Crear `backend/tests/integration/test_criticos_backend.py`:

```python
"""Tests de los 8 críticos de la auditoría 2026-06-12."""

import uuid
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.m04_caja.modelos import Caja
from app.m12_auth.modelos import Rol, Usuario
from app.modelos_stub import SolicitudCredito, Prestamo
from tests._seed_f1d import crear_persona, crear_producto
from tests.conftest import make_test_engine

pytestmark = pytest.mark.asyncio


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _seed_solicitud_aprobada(
    session: AsyncSession,
    monto: Decimal = Decimal("50000"),
) -> tuple:
    """Crea persona + producto + solicitud aprobada + caja."""
    persona = await crear_persona(session)
    producto = await crear_producto(session)
    caja = Caja(nombre="Caja Test", tipo="efectivo", saldo_teorico=Decimal("500000"))
    session.add(caja)
    sol = SolicitudCredito(
        persona_id=persona.id,
        producto_id=producto.id,
        estado="aprobada",
        monto=monto,
        cantidad_cuotas=6,
        tasa_resuelta=Decimal("0.05"),
    )
    session.add(sol)
    await session.flush()
    return persona, producto, sol, caja


# ---------- C1: doble desembolso ----------

async def test_desembolso_con_solicitud_ya_desembolsada_rechaza_409(client, admin_token):
    """Solicitud ya en estado desembolsada → 409 transicion_invalida."""
    engine = make_test_engine()
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as s:
        _, _, sol, caja = await _seed_solicitud_aprobada(s)
        # forzar estado desembolsada directamente
        sol.estado = "desembolsada"
        await s.commit()
        sol_id = str(sol.id)
        caja_id = str(caja.id)
    await engine.dispose()

    r = await client.post(
        f"/api/v1/solicitudes/{sol_id}/desembolsar",
        json={
            "caja_id": caja_id,
            "fecha_negocio": "2026-06-12",
            "tasa_punitorio_diario": "0.001",
        },
        headers=_h(admin_token),
    )
    assert r.status_code == 409, r.text
    assert r.json()["codigo"] == "transicion_invalida"
```

- [ ] **Step 3: Correr el test — debe pasar (ya existía la validación, lo que faltaba era el lock)**

```bash
conda run -n nexocred python -m pytest backend/tests/integration/test_criticos_backend.py::test_desembolso_con_solicitud_ya_desembolsada_rechaza_409 -v
```

Esperado: PASS (la validación de estado ya existe).

- [ ] **Step 4: Escribir el test de doble desembolso secuencial con keys distintas**

Agregar al final de `test_criticos_backend.py`:

```python
async def test_desembolso_solicitud_crea_un_solo_prestamo(client, admin_token):
    """Dos llamadas secuenciales con Idempotency-Key distintas → un único Prestamo."""
    engine = make_test_engine()
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as s:
        _, _, sol, caja = await _seed_solicitud_aprobada(s)
        await s.commit()
        sol_id = str(sol.id)
        caja_id = str(caja.id)
    await engine.dispose()

    payload = {
        "caja_id": caja_id,
        "fecha_negocio": "2026-06-12",
        "tasa_punitorio_diario": "0.001",
    }

    # Primera llamada → desembolsa correctamente
    r1 = await client.post(
        f"/api/v1/solicitudes/{sol_id}/desembolsar",
        json=payload,
        headers={**_h(admin_token), "Idempotency-Key": str(uuid.uuid4())},
    )
    assert r1.status_code == 200, r1.text

    # Segunda llamada con key distinta → debe rechazar 409 (solicitud ya desembolsada)
    r2 = await client.post(
        f"/api/v1/solicitudes/{sol_id}/desembolsar",
        json=payload,
        headers={**_h(admin_token), "Idempotency-Key": str(uuid.uuid4())},
    )
    assert r2.status_code == 409, r2.text

    # Solo un Prestamo creado
    engine2 = make_test_engine()
    maker2 = async_sessionmaker(engine2, class_=AsyncSession, expire_on_commit=False)
    async with maker2() as s:
        from sqlalchemy import select as sa_select
        res = await s.execute(
            sa_select(Prestamo).where(Prestamo.solicitud_id == sol.id)
        )
        prestamos = res.scalars().all()
    await engine2.dispose()
    assert len(prestamos) == 1, f"Se crearon {len(prestamos)} préstamos en lugar de 1"
```

- [ ] **Step 5: Correr — debe FALLAR ahora (el lock aún no está implementado)**

```bash
conda run -n nexocred python -m pytest backend/tests/integration/test_criticos_backend.py::test_desembolso_solicitud_crea_un_solo_prestamo -v
```

Esperado: FAIL porque la segunda llamada puede 200 o crear duplicado.

- [ ] **Step 6: Implementar el lock en servicio_desembolso.py**

En `backend/app/m02_originacion/servicio_desembolso.py`:

1. Agregar import al inicio:
```python
from app.locking import bloquear_caja, bloquear_solicitud
```

2. En la función `desembolsar()`, ANTES del bloque `if solicitud.estado != "aprobada":`, insertar:
```python
    # Lock de solicitud: previene doble desembolso concurrente con keys distintas.
    # Re-leemos la solicitud con FOR UPDATE para que el segundo intento concurrent
    # vea el estado actualizado por el primero.
    solicitud = await bloquear_solicitud(session, solicitud.id)
```

(La función recibe `solicitud` como parámetro; aquí la reemplazamos con la versión fresquísima + locked.)

- [ ] **Step 7: Correr el test — debe PASAR**

```bash
conda run -n nexocred python -m pytest backend/tests/integration/test_criticos_backend.py -v
```

Esperado: ambos tests PASS.

- [ ] **Step 8: Correr suite completa backend para verificar no regresiones**

```bash
conda run -n nexocred python -m pytest backend/tests -q
```

Esperado: todos los tests pasan (≥377 + los nuevos).

- [ ] **Step 9: Commit**

```bash
git add backend/app/locking.py backend/app/m02_originacion/servicio_desembolso.py backend/tests/integration/test_criticos_backend.py
git commit -m "fix(desembolso): lock de solicitud antes del check — previene doble desembolso (C1)"
```

---

### Task 3: [C2] Mover lock antes del check en corregir_uow

**Files:**
- Modify: `backend/app/m04_pagos/servicio.py` (líneas ~326–336)
- Modify: `backend/tests/integration/test_criticos_backend.py`

- [ ] **Step 1: Escribir test que falla**

Agregar al final de `backend/tests/integration/test_criticos_backend.py`:

```python
# ---------- C2: doble corrección de pago ----------

async def _seed_pago_aplicado(client, admin_token) -> tuple[str, str, str]:
    """Crea caja + solicitud + desembolso + pago → retorna (prestamo_id, pago_id, caja_id)."""
    # crear caja
    r = await client.post(
        "/api/v1/cajas", json={"nombre": "Caja C2", "tipo": "efectivo"},
        headers=_h(admin_token),
    )
    assert r.status_code == 201, r.text
    caja_id = r.json()["id"]

    # aporte para tener saldo
    await client.post(
        "/api/v1/tesoreria/aportes",
        json={"monto": "500000.00", "fecha_negocio": "2026-06-01",
              "caja_id": caja_id, "inversor": "Test"},
        headers=_h(admin_token),
    )

    # crear persona y solicitud via API
    r = await client.post(
        "/api/v1/personas",
        json={"apellido": "Test", "nombre": "C2", "dni": str(uuid.uuid4().int)[:8],
              "cuil": "20" + str(uuid.uuid4().int)[:9], "fecha_nac": "1990-01-01",
              "estado_civil": "soltero", "email": f"{uuid.uuid4().hex[:6]}@test.com",
              "telefono": "1100000000", "domicilio_calle": "Calle",
              "domicilio_localidad": "CABA", "domicilio_provincia": "Buenos Aires",
              "tipo_vivienda": "propia", "ingresos_declarados": "500000",
              "ingresos_totales": "500000"},
        headers=_h(admin_token),
    )
    assert r.status_code == 201, r.text
    persona_id = r.json()["id"]

    r = await client.post(
        "/api/v1/solicitudes",
        json={"persona_id": persona_id, "monto": "50000", "cantidad_cuotas": 6,
              "caja_id": caja_id},
        headers=_h(admin_token),
    )
    assert r.status_code == 201, r.text
    sol_id = r.json()["id"]

    # aprobar
    await client.patch(
        f"/api/v1/solicitudes/{sol_id}/estado",
        json={"estado": "aprobada"},
        headers=_h(admin_token),
    )

    # desembolsar
    r = await client.post(
        f"/api/v1/solicitudes/{sol_id}/desembolsar",
        json={"caja_id": caja_id, "fecha_negocio": "2026-06-01",
              "tasa_punitorio_diario": "0.001"},
        headers=_h(admin_token),
    )
    assert r.status_code == 200, r.text
    prestamo_id = r.json()["prestamo_id"]

    # registrar pago
    r = await client.post(
        "/api/v1/pagos",
        json={"prestamo_id": prestamo_id, "monto": "5000.00", "canal": "efectivo",
              "caja_id": caja_id, "fecha_negocio": "2026-06-15"},
        headers=_h(admin_token),
    )
    assert r.status_code == 201, r.text
    pago_id = r.json()["id"]

    return prestamo_id, pago_id, caja_id


async def test_corregir_pago_dos_veces_lanza_409(client, admin_token):
    """Corregir el mismo pago por segunda vez → 409 transicion_invalida."""
    prestamo_id, pago_id, caja_id = await _seed_pago_aplicado(client, admin_token)

    payload = {"monto": "5000.00", "canal": "efectivo",
               "caja_id": caja_id, "fecha_negocio": "2026-06-15"}

    r1 = await client.post(
        f"/api/v1/pagos/{pago_id}/corregir",
        json=payload,
        headers={**_h(admin_token), "Idempotency-Key": str(uuid.uuid4())},
    )
    assert r1.status_code == 200, r1.text

    r2 = await client.post(
        f"/api/v1/pagos/{pago_id}/corregir",
        json=payload,
        headers={**_h(admin_token), "Idempotency-Key": str(uuid.uuid4())},
    )
    assert r2.status_code == 409, r2.text
    assert "corregido" in r2.json().get("codigo", "") or "transicion" in r2.json().get("codigo", "")
```

- [ ] **Step 2: Correr — debe PASAR (la validación ya existe, el lock ya viene después)**

```bash
conda run -n nexocred python -m pytest backend/tests/integration/test_criticos_backend.py::test_corregir_pago_dos_veces_lanza_409 -v
```

Esperado: PASS — la validación de estado ya existe. El bug es solo en el orden (concurrencia), que en tests secuenciales no se manifiesta. El test valida el comportamiento correcto post-fix.

- [ ] **Step 3: Aplicar fix — mover lock antes del check**

En `backend/app/m04_pagos/servicio.py`, la función `corregir_uow`. Localizar las líneas (~326–336):

```python
    original = await obtener_pago(session, pago_original_id)
    if original is None:
        raise ErrorAPI("pago_no_encontrado", "pago original inexistente", status=404)
    if original.estado == "corregido":
        raise ErrorAPI(
            "transicion_invalida", "el pago ya fue corregido", status=409
        )

    prestamo = await bloquear_prestamo(session, original.prestamo_id)
```

Reemplazar por:

```python
    original = await obtener_pago(session, pago_original_id)
    if original is None:
        raise ErrorAPI("pago_no_encontrado", "pago original inexistente", status=404)

    # Lock del prestamo PRIMERO, luego re-leer el pago para ver estado fresco.
    # Orden original tenia el check ANTES del lock: dos correcciones concurrentes
    # ambas pasaban el check antes de que la primera commiteara (C2 auditoria).
    prestamo = await bloquear_prestamo(session, original.prestamo_id)
    await session.refresh(original)  # estado fresco tras adquirir el lock

    if original.estado == "corregido":
        raise ErrorAPI(
            "transicion_invalida", "el pago ya fue corregido", status=409
        )
```

- [ ] **Step 4: Correr tests**

```bash
conda run -n nexocred python -m pytest backend/tests/integration/test_criticos_backend.py -v
```

Esperado: todos PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/m04_pagos/servicio.py backend/tests/integration/test_criticos_backend.py
git commit -m "fix(pagos): lock antes del check en corregir_uow — previene doble corrección (C2)"
```

---

### Task 4: [C3] Cerrar cuotas al novar + guard en registrar_pago

**Files:**
- Modify: `backend/app/m06_novaciones/servicio.py`
- Modify: `backend/app/m04_pagos/servicio.py`
- Modify: `backend/tests/integration/test_criticos_backend.py`

- [ ] **Step 1: Escribir tests que fallan**

Agregar al final de `backend/tests/integration/test_criticos_backend.py`:

```python
# ---------- C3: préstamo novado sigue cobrable ----------

async def test_novar_cancela_cuotas_del_origen(client, admin_token):
    """Después de una novación, las cuotas del préstamo origen deben quedar 'cancelada'."""
    from sqlalchemy import select as sa_select
    from app.modelos_stub import Cuota

    prestamo_id, _, caja_id = await _seed_pago_aplicado(client, admin_token)

    # novar el préstamo (repactar rápido como novacion simple)
    r = await client.post(
        "/api/v1/novaciones/repactar-rapido",
        json={"prestamo_id": prestamo_id,
              "pago_cuenta": "0.00",
              "nueva_cuota": "6000.00",
              "fecha_primera_cuota": "2026-08-01",
              "caja_id": caja_id,
              "fecha_negocio": "2026-07-01"},
        headers=_h(admin_token),
    )
    assert r.status_code == 200, r.text

    # las cuotas del préstamo origen deben ser 'cancelada'
    engine = make_test_engine()
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as s:
        import uuid as _uuid
        res = await s.execute(
            sa_select(Cuota).where(Cuota.prestamo_id == _uuid.UUID(prestamo_id))
        )
        cuotas = res.scalars().all()
    await engine.dispose()

    pendientes = [c for c in cuotas if c.estado in ("pendiente", "parcial")]
    assert len(pendientes) == 0, (
        f"Hay {len(pendientes)} cuotas pendientes/parciales tras la novación: "
        f"{[(c.numero, c.estado) for c in pendientes]}"
    )


async def test_pago_sobre_prestamo_novado_rechaza_409(client, admin_token):
    """registrar_pago sobre préstamo con estado='novado' → 409."""
    prestamo_id, _, caja_id = await _seed_pago_aplicado(client, admin_token)

    # novar
    r = await client.post(
        "/api/v1/novaciones/repactar-rapido",
        json={"prestamo_id": prestamo_id,
              "pago_cuenta": "0.00",
              "nueva_cuota": "6000.00",
              "fecha_primera_cuota": "2026-08-01",
              "caja_id": caja_id,
              "fecha_negocio": "2026-07-01"},
        headers=_h(admin_token),
    )
    assert r.status_code == 200, r.text

    # intentar pago contra el préstamo novado
    r = await client.post(
        "/api/v1/pagos",
        json={"prestamo_id": prestamo_id, "monto": "5000.00",
              "canal": "efectivo", "caja_id": caja_id,
              "fecha_negocio": "2026-07-15"},
        headers=_h(admin_token),
    )
    assert r.status_code == 409, r.text
    assert r.json()["codigo"] == "prestamo_no_cobrable"
```

- [ ] **Step 2: Correr — deben FALLAR**

```bash
conda run -n nexocred python -m pytest backend/tests/integration/test_criticos_backend.py::test_novar_cancela_cuotas_del_origen backend/tests/integration/test_criticos_backend.py::test_pago_sobre_prestamo_novado_rechaza_409 -v
```

Esperado: ambos FAIL.

- [ ] **Step 3: Fix en _crear_novacion — cerrar cuotas**

En `backend/app/m06_novaciones/servicio.py`, localizar `_crear_novacion`. Agregar el import al inicio del archivo si no existe:

```python
from sqlalchemy import update as sa_update
from app.modelos_stub import Cuota
```

Dentro de `_crear_novacion`, después de `origen.estado = "novado"` y antes del `await session.flush()` final del loop:

```python
    for origen in origenes:
        session.add(NovacionOrigen(novacion_id=nov.id, prestamo_id=origen.id))
        origen.estado = "novado"
        # Cerrar cuotas pendientes del préstamo novado para que no sean cobrables.
        await session.execute(
            sa_update(Cuota)
            .where(Cuota.prestamo_id == origen.id, Cuota.estado.in_(["pendiente", "parcial"]))
            .values(estado="cancelada")
        )
```

- [ ] **Step 4: Fix en registrar_pago_uow — guard de estado**

En `backend/app/m04_pagos/servicio.py`, en `registrar_pago_uow`, después de:
```python
    prestamo = await bloquear_prestamo(session, prestamo_id)
    if prestamo.snapshot_terminos is None:
        raise ErrorAPI(
            "prestamo_sin_snapshot", "el prestamo no esta desembolsado", status=409
        )
```

Agregar:
```python
    if prestamo.estado not in ("vigente", "en_mora"):
        raise ErrorAPI(
            "prestamo_no_cobrable",
            f"no se puede registrar un pago sobre un préstamo en estado '{prestamo.estado}'",
            status=409,
        )
```

- [ ] **Step 5: Correr tests — deben PASAR**

```bash
conda run -n nexocred python -m pytest backend/tests/integration/test_criticos_backend.py -v
```

Esperado: todos PASS.

- [ ] **Step 6: Suite completa**

```bash
conda run -n nexocred python -m pytest backend/tests -q
```

- [ ] **Step 7: Commit**

```bash
git add backend/app/m06_novaciones/servicio.py backend/app/m04_pagos/servicio.py backend/tests/integration/test_criticos_backend.py
git commit -m "fix(novaciones,pagos): cerrar cuotas al novar + guard estado en registrar_pago (C3)"
```

---

### Task 5: [C5] Doble pago de comisiones

**Files:**
- Modify: `backend/app/locking.py`
- Modify: `backend/app/m09_comisiones/servicio.py`
- Modify: `backend/tests/integration/test_criticos_backend.py`

- [ ] **Step 1: Agregar bloquear_liquidacion a locking.py**

En `backend/app/locking.py`, agregar al final:

```python
from app.m09_comisiones.modelos import ComisionLiquidacion


def _stmt_liquidacion_for_update(liquidacion_id: uuid.UUID) -> Select:
    return (
        select(ComisionLiquidacion)
        .where(ComisionLiquidacion.id == liquidacion_id)
        .with_for_update()
    )


async def bloquear_liquidacion(
    session: AsyncSession, liquidacion_id: uuid.UUID
) -> "ComisionLiquidacion":
    res = await session.execute(_stmt_liquidacion_for_update(liquidacion_id))
    liq = res.scalar_one_or_none()
    if liq is None:
        raise ErrorAPI("liquidacion_no_encontrada", "liquidacion inexistente", status=404)
    return liq
```

- [ ] **Step 2: Escribir tests que fallan**

Agregar al final de `backend/tests/integration/test_criticos_backend.py`:

```python
# ---------- C5: doble pago de comisiones ----------

async def _seed_vendedor_con_devengo(client, admin_token) -> tuple[str, str, str]:
    """Crea vendedor + devengo de comisión. Retorna (vendedor_id, devengo_id, caja_id)."""
    # crear caja con saldo
    r = await client.post(
        "/api/v1/cajas", json={"nombre": "Caja Comisiones", "tipo": "efectivo"},
        headers=_h(admin_token),
    )
    caja_id = r.json()["id"]
    await client.post(
        "/api/v1/tesoreria/aportes",
        json={"monto": "100000.00", "fecha_negocio": "2026-06-01",
              "caja_id": caja_id, "inversor": "Seed"},
        headers=_h(admin_token),
    )

    # crear vendedor
    r = await client.post(
        "/api/v1/usuarios",
        json={"email": f"vendedor_{uuid.uuid4().hex[:6]}@nexo.test",
              "nombre": "Vendedor C5", "password": "secreto123",
              "roles": ["vendedor"]},
        headers=_h(admin_token),
    )
    assert r.status_code == 201, r.text
    vendedor_id = r.json()["id"]

    # crear devengo manual via seed directo en DB
    engine = make_test_engine()
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as s:
        from app.m09_comisiones.modelos import ComisionDevengo
        from datetime import date as _date
        dev = ComisionDevengo(
            vendedor_id=uuid.UUID(vendedor_id),
            tipo="originacion",
            monto=Decimal("1000.00"),
            estado="devengada",
            fecha_negocio=_date(2026, 6, 1),
        )
        s.add(dev)
        await s.commit()
        devengo_id = str(dev.id)
    await engine.dispose()

    return vendedor_id, devengo_id, caja_id


async def test_generar_liquidacion_dos_veces_no_duplica_devengos(client, admin_token):
    """Generar liquidación → aprobar → generar otra del mismo período → segunda tiene total=0."""
    vendedor_id, _, caja_id = await _seed_vendedor_con_devengo(client, admin_token)

    periodo = {"periodo_desde": "2026-06-01", "periodo_hasta": "2026-06-30"}

    # primera liquidación
    r = await client.post(
        "/api/v1/comisiones/liquidaciones",
        json={**periodo, "vendedor_id": vendedor_id},
        headers=_h(admin_token),
    )
    assert r.status_code == 201, r.text
    liq1_total = r.json()["monto_total"]
    assert Decimal(liq1_total) > 0, "La primera liquidación debe tener monto > 0"

    # segunda liquidación del mismo período
    r2 = await client.post(
        "/api/v1/comisiones/liquidaciones",
        json={**periodo, "vendedor_id": vendedor_id},
        headers=_h(admin_token),
    )
    assert r2.status_code == 201, r2.text
    liq2_total = r2.json()["monto_total"]
    assert Decimal(liq2_total) == Decimal("0.00"), (
        f"La segunda liquidación debe ser 0 (devengo ya incluido en la primera), "
        f"pero es {liq2_total}"
    )
```

- [ ] **Step 3: Correr — debe FALLAR (liq2 tiene el mismo monto que liq1)**

```bash
conda run -n nexocred python -m pytest backend/tests/integration/test_criticos_backend.py::test_generar_liquidacion_dos_veces_no_duplica_devengos -v
```

Esperado: FAIL.

- [ ] **Step 4: Fix en generar_liquidacion — excluir devengos ya en liquidaciones activas**

En `backend/app/m09_comisiones/servicio.py`, localizar `generar_liquidacion`. Agregar imports al inicio del archivo si no existen:

```python
from app.m09_comisiones.modelos import (
    ComisionDevengo, ComisionLiquidacion, ComisionLiquidacionDetalle
)
```

Reemplazar la query de selección de devengos (el `select(ComisionDevengo).where(...)`) por:

```python
    # Excluir devengos que ya están incluidos en una liquidación borrador o aprobada.
    # (Solo pasan a 'liquidada' al pagar; hasta entonces se excluyen para evitar
    # que el mismo devengo entre en dos liquidaciones distintas — C5 auditoria.)
    ya_incluidos = (
        select(ComisionLiquidacionDetalle.comision_devengo_id)
        .join(
            ComisionLiquidacion,
            ComisionLiquidacionDetalle.liquidacion_id == ComisionLiquidacion.id,
        )
        .where(ComisionLiquidacion.estado.in_(["borrador", "aprobada"]))
        .scalar_subquery()
    )
    res = await session.execute(
        select(ComisionDevengo).where(
            ComisionDevengo.vendedor_id == vendedor_id,
            ComisionDevengo.estado.in_(["devengada", "confirmada"]),
            ComisionDevengo.id.not_in(ya_incluidos),
        )
    )
```

- [ ] **Step 5: Fix en pagar_liquidacion — lock antes del check**

En `backend/app/m09_comisiones/servicio.py`, en `pagar_liquidacion`, agregar import al inicio:

```python
from app.locking import bloquear_caja, bloquear_liquidacion
```

Localizar (después del bloque de idempotencia):
```python
    liquidacion = await obtener_liquidacion(session, liquidacion_id)
    if liquidacion is None:
        raise ErrorAPI("liquidacion_no_encontrada", "liquidacion inexistente", status=404)
    if liquidacion.estado != "aprobada":
```

Reemplazar por:
```python
    # Lock de la liquidación ANTES del check de estado: previene doble pago
    # concurrente con Idempotency-Keys distintas (C5 auditoria).
    liquidacion = await bloquear_liquidacion(session, liquidacion_id)
    if liquidacion.estado != "aprobada":
```

(Eliminar la línea `liquidacion = await obtener_liquidacion(session, liquidacion_id)` que queda redundante, y actualizar el check de None si lo hubiera — `bloquear_liquidacion` ya lanza 404.)

- [ ] **Step 6: Correr todos los tests**

```bash
conda run -n nexocred python -m pytest backend/tests/integration/test_criticos_backend.py -v
conda run -n nexocred python -m pytest backend/tests -q
```

Esperado: todos PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/app/locking.py backend/app/m09_comisiones/servicio.py backend/tests/integration/test_criticos_backend.py
git commit -m "fix(comisiones): excluir devengos ya liquidados + lock en pagar_liquidacion (C5)"
```

---

## GRUPO B: Backend — Control de Acceso

---

### Task 6: [C4a] Cobrador no puede aprobar su propia rendición

**Files:**
- Modify: `backend/app/m05_ruta/servicio.py`
- Modify: `backend/tests/integration/test_criticos_backend.py`

- [ ] **Step 1: Agregar fixture cobrador_token al conftest**

En `backend/tests/conftest.py`, agregar al final (análogo a `analista_token`):

```python
@pytest_asyncio.fixture
async def cobrador_token(client, roles_seed) -> str:
    from app.m12_auth.servicio import crear_usuario

    engine = make_test_engine()
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as s:
        u = await crear_usuario(
            s,
            email="cobrador@nexo.test",
            nombre="Cobrador",
            password="secreto123",
            roles=["cobrador"],
            actor_id=None,
        )
        await s.commit()
        cobrador_id = u.id
    await engine.dispose()
    r = await client.post(
        "/api/v1/auth/login",
        json={"email": "cobrador@nexo.test", "password": "secreto123"},
    )
    return r.json()["access_token"]
```

- [ ] **Step 2: Escribir tests que fallan**

Agregar al final de `backend/tests/integration/test_criticos_backend.py`:

```python
# ---------- C4a: cobrador auto-aprueba rendición ----------

async def _seed_ruta_con_rendicion(client, cobrador_token) -> tuple[str, str]:
    """Genera ruta + rendición para el cobrador. Retorna (ruta_id, rendicion_id)."""
    # obtener cobrador_id del token
    import base64, json as _json
    payload_b64 = cobrador_token.split(".")[1]
    payload_b64 += "=" * (-len(payload_b64) % 4)
    cobrador_id = _json.loads(base64.b64decode(payload_b64))["sub"]

    engine = make_test_engine()
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as s:
        from app.modelos_stub import RutaDiaria
        ruta = RutaDiaria(cobrador_id=uuid.UUID(cobrador_id),
                          fecha=date(2026, 6, 12), estado="abierta")
        s.add(ruta)
        await s.flush()
        from app.modelos_stub import Rendicion
        rend = Rendicion(ruta_id=ruta.id, cobrador_id=uuid.UUID(cobrador_id),
                         estado="presentada", total_cobrado=Decimal("0"),
                         diferencia=Decimal("0"))
        s.add(rend)
        await s.commit()
        return str(ruta.id), str(rend.id)
    await engine.dispose()


async def test_cobrador_no_puede_aprobar_su_propia_rendicion(
    client, cobrador_token, admin_token
):
    """Cobrador intenta aprobar su propia rendición → 403."""
    _, rend_id = await _seed_ruta_con_rendicion(client, cobrador_token)

    r = await client.patch(
        f"/api/v1/rendiciones/{rend_id}",
        json={"estado": "aprobada"},
        headers=_h(cobrador_token),
    )
    assert r.status_code == 403, r.text


async def test_admin_puede_aprobar_rendicion_de_cobrador(
    client, cobrador_token, admin_token
):
    """Admin aprueba rendición de cobrador → 200."""
    _, rend_id = await _seed_ruta_con_rendicion(client, cobrador_token)

    r = await client.patch(
        f"/api/v1/rendiciones/{rend_id}",
        json={"estado": "aprobada"},
        headers=_h(admin_token),
    )
    assert r.status_code == 200, r.text


async def test_cobrador_puede_presentar_su_propia_rendicion(
    client, cobrador_token
):
    """Cobrador puede presentar (borrador → presentada) su rendición → 200."""
    engine = make_test_engine()
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    import base64, json as _json
    payload_b64 = cobrador_token.split(".")[1]
    payload_b64 += "=" * (-len(payload_b64) % 4)
    cobrador_id = _json.loads(base64.b64decode(payload_b64))["sub"]

    async with maker() as s:
        from app.modelos_stub import RutaDiaria, Rendicion
        ruta = RutaDiaria(cobrador_id=uuid.UUID(cobrador_id),
                          fecha=date(2026, 6, 13), estado="abierta")
        s.add(ruta)
        await s.flush()
        rend = Rendicion(ruta_id=ruta.id, cobrador_id=uuid.UUID(cobrador_id),
                         estado="borrador", total_cobrado=Decimal("0"),
                         diferencia=Decimal("0"))
        s.add(rend)
        await s.commit()
        rend_id = str(rend.id)
    await engine.dispose()

    r = await client.patch(
        f"/api/v1/rendiciones/{rend_id}",
        json={"estado": "presentada"},
        headers=_h(cobrador_token),
    )
    assert r.status_code == 200, r.text
```

- [ ] **Step 3: Correr — `test_cobrador_no_puede_aprobar` debe FALLAR (actualmente 200)**

```bash
conda run -n nexocred python -m pytest backend/tests/integration/test_criticos_backend.py::test_cobrador_no_puede_aprobar_su_propia_rendicion -v
```

Esperado: FAIL (actualmente permite la aprobación).

- [ ] **Step 4: Implementar el guard en cambiar_estado_rendicion**

En `backend/app/m05_ruta/servicio.py`, en `cambiar_estado_rendicion`, agregar después de `if estado not in permitidos:` y antes de `if estado == "aprobada":`:

```python
    if estado == "aprobada" and actor_id == rendicion.cobrador_id:
        from app.errors import ErrorAPI
        raise ErrorAPI(
            "aprobacion_propia_no_permitida",
            "un cobrador no puede aprobar su propia rendición",
            status=403,
        )
```

- [ ] **Step 5: Correr todos los tests C4a**

```bash
conda run -n nexocred python -m pytest backend/tests/integration/test_criticos_backend.py::test_cobrador_no_puede_aprobar_su_propia_rendicion backend/tests/integration/test_criticos_backend.py::test_admin_puede_aprobar_rendicion_de_cobrador backend/tests/integration/test_criticos_backend.py::test_cobrador_puede_presentar_su_propia_rendicion -v
```

Esperado: todos PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/m05_ruta/servicio.py backend/tests/conftest.py backend/tests/integration/test_criticos_backend.py
git commit -m "fix(ruta): cobrador no puede aprobar su propia rendicion (C4a)"
```

---

### Task 7: [C4b] IDOR de rutas — check de ownership

**Files:**
- Modify: `backend/app/m05_ruta/router.py`
- Modify: `backend/tests/integration/test_criticos_backend.py`

- [ ] **Step 1: Escribir test que falla**

Agregar al final de `backend/tests/integration/test_criticos_backend.py`:

```python
# ---------- C4b: IDOR de rutas ----------

@pytest_asyncio.fixture
async def cobrador2_token(client, roles_seed) -> str:
    from app.m12_auth.servicio import crear_usuario

    engine = make_test_engine()
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as s:
        u = await crear_usuario(
            s,
            email="cobrador2@nexo.test",
            nombre="Cobrador2",
            password="secreto123",
            roles=["cobrador"],
            actor_id=None,
        )
        await s.commit()
        cobrador2_id = u.id
    await engine.dispose()
    r = await client.post(
        "/api/v1/auth/login",
        json={"email": "cobrador2@nexo.test", "password": "secreto123"},
    )
    return r.json()["access_token"]


async def test_cobrador_no_puede_visitar_ruta_ajena(
    client, cobrador_token, cobrador2_token
):
    """Cobrador B intenta visitar una ruta de cobrador A → 403."""
    # crear ruta del cobrador A (cobrador_token)
    _, rend_id = await _seed_ruta_con_rendicion(client, cobrador_token)
    import base64, json as _json
    payload_b64 = cobrador_token.split(".")[1]
    payload_b64 += "=" * (-len(payload_b64) % 4)
    cobrador_a_id = _json.loads(base64.b64decode(payload_b64))["sub"]

    engine = make_test_engine()
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as s:
        from app.modelos_stub import RutaDiaria, ParadaRuta
        from sqlalchemy import select as sa_select
        res = await s.execute(
            sa_select(RutaDiaria).where(
                RutaDiaria.cobrador_id == uuid.UUID(cobrador_a_id)
            ).order_by(RutaDiaria.fecha.desc()).limit(1)
        )
        ruta = res.scalar_one()
        ruta_id = str(ruta.id)
        # agregar una parada
        persona = await crear_persona(s, nombre="Deudor IDOR")
        producto = await crear_producto(s)
        from tests._seed_f1d import crear_prestamo as _crear_prestamo
        prestamo = await _crear_prestamo(s, persona.id, producto.id,
                                          capital=Decimal("10000"),
                                          fecha_desembolso=date(2026, 6, 1))
        parada = ParadaRuta(ruta_id=ruta.id, prestamo_id=prestamo.id,
                            orden=1, resultado="pendiente")
        s.add(parada)
        await s.commit()
        parada_id = str(parada.id)
    await engine.dispose()

    # cobrador B intenta visitar la ruta de cobrador A
    r = await client.post(
        f"/api/v1/rutas/{ruta_id}/paradas/{parada_id}/visitar",
        json={"resultado": "ausente"},
        headers=_h(cobrador2_token),
    )
    assert r.status_code == 403, r.text
```

- [ ] **Step 2: Correr — debe FALLAR (actualmente 200 o 404)**

```bash
conda run -n nexocred python -m pytest backend/tests/integration/test_criticos_backend.py::test_cobrador_no_puede_visitar_ruta_ajena -v
```

Esperado: FAIL.

- [ ] **Step 3: Implementar _get_ruta_propia en router.py**

En `backend/app/m05_ruta/router.py`, agregar helper después de `_get_ruta`:

```python
def _es_admin(actor: Usuario) -> bool:
    return any(r.nombre == "admin" for r in actor.roles)


async def _get_ruta_propia(session, ruta_id: uuid.UUID, actor: Usuario):
    """Carga la ruta y verifica que pertenece al actor (o que el actor es admin)."""
    ruta = await _get_ruta(session, ruta_id)
    if not _es_admin(actor) and ruta.cobrador_id != actor.id:
        raise ErrorAPI(
            "acceso_denegado",
            "no tenés acceso a esta ruta",
            status=403,
        )
    return ruta
```

Luego, reemplazar en los endpoints que usan `_get_ruta` con actor:

**visitar_parada** (~línea 128):
```python
    ruta = await _get_ruta_propia(session, ruta_id, actor)
```

**sync_ruta** (~línea 145):
```python
    ruta = await _get_ruta_propia(session, ruta_id, actor)
```

**detalle_ruta** (~línea 97, si tiene actor):
Si `detalle_ruta` recibe `actor: RutaUser`, reemplazar `_get_ruta` por `_get_ruta_propia`. Si solo recibe `_: RutaUser` (sin actor nombrado), cambiar la firma a `actor: RutaUser` y agregar el check.

- [ ] **Step 4: Correr todos los tests del grupo B**

```bash
conda run -n nexocred python -m pytest backend/tests/integration/test_criticos_backend.py -k "C4 or cobrador or ruta_ajena or rendicion" -v
conda run -n nexocred python -m pytest backend/tests -q
```

Esperado: todos PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/m05_ruta/router.py backend/tests/integration/test_criticos_backend.py
git commit -m "fix(ruta): ownership check en visitar/sync/detalle — previene IDOR (C4b)"
```

---

## GRUPO C: Frontend

---

### Task 8: [C6] Idempotency-Key rota tras éxito en RegistrarPagoPage

**Files:**
- Modify: `frontend/src/features/pagos/RegistrarPagoPage.tsx`
- Create: `frontend/src/features/pagos/RegistrarPagoPage.test.tsx`

- [ ] **Step 1: Escribir test que falla**

Crear `frontend/src/features/pagos/RegistrarPagoPage.test.tsx`:

```tsx
import "fake-indexeddb/auto";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { renderWithProviders } from "@/test/utils";
import { setToken, setSessionUser } from "@/lib/auth";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({}),
  Link: ({ children, ...p }: { children: React.ReactNode }) => <a {...p}>{children}</a>,
}));

const BASE = "http://localhost/api/v1";

const PAGO_OK = {
  id: "p1",
  prestamo_id: "prestamo-1",
  monto: "100.00",
  excedente: "0.00",
  estado: "aplicado",
  canal: "efectivo",
  fecha_negocio: "2026-06-12",
  corrige_pago_id: null,
  created_at: "x",
  imputaciones: [],
};

describe("RegistrarPagoPage — idempotency key", () => {
  beforeEach(() => {
    setToken({ access_token: "t", refresh_token: "r", token_type: "bearer" });
    setSessionUser({ email: "admin@nexocred.test", nombre: "Admin", roles: ["admin"] });
  });

  it("rota la Idempotency-Key después de un submit exitoso", async () => {
    const capturedKeys: string[] = [];
    server.use(
      http.post(`${BASE}/pagos`, async ({ request }) => {
        const key = request.headers.get("Idempotency-Key");
        if (key) capturedKeys.push(key);
        return HttpResponse.json(PAGO_OK, { status: 201 });
      }),
    );

    const { RegistrarPagoPage } = await import("./RegistrarPagoPage");
    renderWithProviders(<RegistrarPagoPage />);

    // Primer submit
    await userEvent.type(screen.getByLabelText(/monto/i), "100");
    await userEvent.click(screen.getByRole("button", { name: /registrar pago/i }));
    await waitFor(() => expect(capturedKeys).toHaveLength(1));

    // Segundo submit (distinto pago, misma página)
    await userEvent.clear(screen.getByLabelText(/monto/i));
    await userEvent.type(screen.getByLabelText(/monto/i), "200");
    await userEvent.click(screen.getByRole("button", { name: /registrar pago/i }));
    await waitFor(() => expect(capturedKeys).toHaveLength(2));

    expect(capturedKeys[0]).not.toBe(capturedKeys[1]);
  });

  it("NO rota la Idempotency-Key tras un error (para que el retry reutilice la misma)", async () => {
    const capturedKeys: string[] = [];
    server.use(
      http.post(`${BASE}/pagos`, async ({ request }) => {
        const key = request.headers.get("Idempotency-Key");
        if (key) capturedKeys.push(key);
        return HttpResponse.json({ detail: "error" }, { status: 500 });
      }),
    );

    const { RegistrarPagoPage } = await import("./RegistrarPagoPage");
    renderWithProviders(<RegistrarPagoPage />);

    await userEvent.type(screen.getByLabelText(/monto/i), "100");
    await userEvent.click(screen.getByRole("button", { name: /registrar pago/i }));
    await waitFor(() => expect(capturedKeys).toHaveLength(1));

    await userEvent.click(screen.getByRole("button", { name: /registrar pago/i }));
    await waitFor(() => expect(capturedKeys).toHaveLength(2));

    expect(capturedKeys[0]).toBe(capturedKeys[1]);
  });
});
```

- [ ] **Step 2: Correr — deben FALLAR**

```bash
cd /Users/fede/repos/nexocred/frontend && npm test -- --run src/features/pagos/RegistrarPagoPage.test.tsx
```

Esperado: FAIL (la key es la misma en ambos submits exitosos).

- [ ] **Step 3: Implementar fix en RegistrarPagoPage.tsx**

En `frontend/src/features/pagos/RegistrarPagoPage.tsx`, cambiar:

```tsx
// ANTES:
const [idemKey] = useState(() => newIdempotencyKey());
```

por:

```tsx
const [idemKey, setIdemKey] = useState(() => newIdempotencyKey());
```

Y en `onSubmit`, reemplazar el bloque try/catch:

```tsx
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const body = {
      prestamo_id: prestamoId,
      monto,
      canal,
      caja_id: cajaId,
    } as unknown as components["schemas"]["PagoCreate"];
    try {
      await registrar.mutateAsync({ body, idempotencyKey: idemKey });
      // Rotar la key tras éxito: el próximo pago distinto usa una key nueva.
      // En caso de error NO rotamos: el retry debe reutilizar la misma key.
      setIdemKey(newIdempotencyKey());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar el pago");
    }
  }
```

- [ ] **Step 4: Correr tests — deben PASAR**

```bash
cd /Users/fede/repos/nexocred/frontend && npm test -- --run src/features/pagos/RegistrarPagoPage.test.tsx
```

Esperado: ambos PASS.

- [ ] **Step 5: Correr suite frontend completa**

```bash
cd /Users/fede/repos/nexocred/frontend && npm test -- --run
```

Esperado: ≥161 tests PASS + los 2 nuevos.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/pagos/RegistrarPagoPage.tsx frontend/src/features/pagos/RegistrarPagoPage.test.tsx
git commit -m "fix(pagos): rotar Idempotency-Key tras exito en RegistrarPagoPage (C6)"
```

---

### Task 9: [C7] Doble-tap en visita de ruta

**Files:**
- Modify: `frontend/src/features/ruta/VisitaCaptureForm.tsx`
- Create: `frontend/src/features/ruta/VisitaCaptureForm.test.tsx`

- [ ] **Step 1: Escribir test que falla**

Crear `frontend/src/features/ruta/VisitaCaptureForm.test.tsx`:

```tsx
import "fake-indexeddb/auto";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { VisitaCaptureForm } from "./VisitaCaptureForm";
import type { components } from "@/lib/api/schema";

type Parada = components["schemas"]["ParadaConSaldoOut"];

const PARADA: Parada = {
  id: "parada-1",
  ruta_id: "ruta-1",
  prestamo_id: "prestamo-1",
  orden: 1,
  resultado: "pendiente",
  monto_cobrado: null,
  foto_url: null,
  lat: null,
  lng: null,
  notas: null,
  visitada_en: null,
  saldo_exigible: "10000.00",
};

describe("VisitaCaptureForm — protección doble-tap", () => {
  it("guardar() dos veces en la misma instancia produce el mismo id y pagoId", async () => {
    const captured: { id: string; pagoId: string | null }[] = [];
    const onGuardar = vi.fn((v) => {
      captured.push({ id: v.id, pagoId: v.pagoId });
      return Promise.resolve();
    });

    render(
      <VisitaCaptureForm
        parada={PARADA}
        rutaId="ruta-1"
        onGuardar={onGuardar}
        onCancelar={vi.fn()}
      />,
    );

    const btn = screen.getByRole("button", { name: /guardar visita/i });
    await userEvent.click(btn);
    await userEvent.click(btn);

    expect(onGuardar).toHaveBeenCalledTimes(2);
    expect(captured[0].id).toBe(captured[1].id);
    expect(captured[0].pagoId).toBe(captured[1].pagoId);
  });
});
```

- [ ] **Step 2: Correr — debe FALLAR (IDs son distintos)**

```bash
cd /Users/fede/repos/nexocred/frontend && npm test -- --run src/features/ruta/VisitaCaptureForm.test.tsx
```

Esperado: FAIL.

- [ ] **Step 3: Implementar fix en VisitaCaptureForm.tsx**

En `frontend/src/features/ruta/VisitaCaptureForm.tsx`:

1. Agregar import de `useState` (si no está) y `TransactionButton`:
```tsx
import { useState } from "react";
import { TransactionButton } from "@/components/TransactionButton";
```

2. Dentro del componente, agregar estado para los IDs fijos (antes del `const esPago`):
```tsx
  // IDs fijados al montar el componente — no pueden variar entre taps.
  // Si se generasen en guardar(), un doble-tap crearía dos cobros con IDs
  // distintos que la idempotencia por id no puede dedupar (C7 auditoría).
  const [visitaId] = useState(() => uuidv7());
  const [pagoId] = useState(() => uuidv7());
  const [guardando, setGuardando] = useState(false);
```

3. Reemplazar la función `guardar()`:
```tsx
  async function guardar() {
    if (guardando) return;
    setGuardando(true);
    try {
      const visita: VisitaEncolada = {
        id: visitaId,
        rutaId,
        paradaId: parada.id,
        prestamoId: parada.prestamo_id,
        orden: parada.orden,
        resultado,
        montoCobrado: esPago ? (monto || "0.00") : null,
        pagoId: esPago ? pagoId : null,
        fotoUrl: foto,
        lat: geo?.lat ?? null,
        lng: geo?.lng ?? null,
        notas: notas || null,
        visitadaEn: new Date().toISOString(),
      };
      await onGuardar(visita);
    } finally {
      setGuardando(false);
    }
  }
```

4. Reemplazar el botón "Guardar visita":
```tsx
        <TransactionButton type="button" pending={guardando} onClick={guardar}>
          Guardar visita
        </TransactionButton>
```

- [ ] **Step 4: Correr tests — deben PASAR**

```bash
cd /Users/fede/repos/nexocred/frontend && npm test -- --run src/features/ruta/VisitaCaptureForm.test.tsx
```

Esperado: PASS.

- [ ] **Step 5: Suite completa frontend**

```bash
cd /Users/fede/repos/nexocred/frontend && npm test -- --run
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/ruta/VisitaCaptureForm.tsx frontend/src/features/ruta/VisitaCaptureForm.test.tsx
git commit -m "fix(ruta): IDs fijos en VisitaCaptureForm + TransactionButton — previene doble cobro (C7)"
```

---

### Task 10: [C8] Redirect infinito en login para cobrador/tesorería

**Files:**
- Modify: `frontend/src/routes/guards.ts`
- Modify: `frontend/src/routes/router.tsx`
- Modify: `frontend/src/routes/guards.test.ts`

- [ ] **Step 1: Escribir tests que fallan**

En `frontend/src/routes/guards.test.ts`, agregar al final de la suite `describe("route guards", ...)`:

```ts
  // ---- C8: fallback correcto por rol ----
  it("fallbackRoute: cobrador → /ruta", () => {
    const { fallbackRoute } = require("./guards");
    expect(fallbackRoute(["cobrador"])).toBe("/ruta");
  });

  it("fallbackRoute: tesoreria → /tesoreria", () => {
    const { fallbackRoute } = require("./guards");
    expect(fallbackRoute(["tesoreria"])).toBe("/tesoreria");
  });

  it("fallbackRoute: vendedor → /solicitudes", () => {
    const { fallbackRoute } = require("./guards");
    expect(fallbackRoute(["vendedor"])).toBe("/solicitudes");
  });

  it("fallbackRoute: sin roles conocidos → /login", () => {
    const { fallbackRoute } = require("./guards");
    expect(fallbackRoute([])).toBe("/login");
  });

  it("enforceRoles: cobrador rechazado de /personas redirige a /ruta (no /personas)", () => {
    loginAs(["cobrador"]);
    try {
      enforceRoles(ROUTE_ROLES["/personas"]);
      expect.fail("debía lanzar redirect");
    } catch (e: unknown) {
      expect(e).toEqual(redirect({ to: "/ruta" }));
    }
    clearToken();
  });
```

- [ ] **Step 2: Correr — deben FALLAR (`fallbackRoute` no existe)**

```bash
cd /Users/fede/repos/nexocred/frontend && npm test -- --run src/routes/guards.test.ts
```

Esperado: FAIL (varios tests fallan porque `fallbackRoute` no existe).

- [ ] **Step 3: Implementar fallbackRoute y corregir enforceRoles en guards.ts**

En `frontend/src/routes/guards.ts`, al final del archivo (antes de `enforceRoles`):

```ts
/**
 * Ruta de fallback por rol. Usada cuando un usuario autenticado intenta acceder
 * a una ruta sin permiso: en lugar de redirigir siempre a /personas (loop infinito
 * para cobrador/tesorería que no tienen acceso a esa ruta), lo llevamos a la
 * primera ruta accesible según su rol principal (C8 auditoría).
 */
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

Luego en `enforceRoles`, reemplazar:
```ts
    throw redirect({ to: "/personas" as string });
```
por:
```ts
    const user = getSessionUser();
    throw redirect({ to: fallbackRoute(user?.roles ?? []) as string });
```

(Nota: `getSessionUser()` se llama dos veces ahora; si ya se llama arriba en la función, reutilizar la variable existente.)

- [ ] **Step 4: Corregir el post-login redirect en router.tsx**

En `frontend/src/routes/router.tsx`, localizar la línea:
```tsx
return <LoginPage onSuccess={() => (window.location.href = "/personas")} />;
```

Reemplazar por:
```tsx
return (
  <LoginPage
    onSuccess={() => {
      const u = getSessionUser();
      window.location.href = fallbackRoute(u?.roles ?? []);
    }}
  />
);
```

Asegurarse de que `fallbackRoute` y `getSessionUser` están importados en `router.tsx`:
```tsx
import { enforceRoles, fallbackRoute } from "./guards";
import { getSessionUser } from "@/lib/auth";
```

- [ ] **Step 5: Correr tests — deben PASAR**

```bash
cd /Users/fede/repos/nexocred/frontend && npm test -- --run src/routes/guards.test.ts
```

Esperado: todos PASS (incluyendo los nuevos).

- [ ] **Step 6: Suite completa frontend**

```bash
cd /Users/fede/repos/nexocred/frontend && npm test -- --run
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/routes/guards.ts frontend/src/routes/router.tsx frontend/src/routes/guards.test.ts
git commit -m "fix(auth): fallbackRoute por rol — elimina redirect infinito para cobrador/tesoreria (C8)"
```

---

## Verificación final

### Task 11: Verde completo + commit de cierre

**Files:** ninguno nuevo, solo verificación.

- [ ] **Step 1: Suite backend completa**

```bash
conda run -n nexocred python -m pytest backend/tests -q
```

Esperado: ≥ 377 + tests nuevos, 0 fallos, 0 errores.

- [ ] **Step 2: Suite frontend completa**

```bash
cd /Users/fede/repos/nexocred/frontend && npm test -- --run
```

Esperado: ≥ 161 + tests nuevos, todos PASS.

- [ ] **Step 3: Linter y typecheck**

```bash
conda run -n nexocred ruff check backend
cd /Users/fede/repos/nexocred/frontend && npm run typecheck
```

Esperado: 0 errores en ambos.

- [ ] **Step 4: Commit de cierre**

```bash
git add -A
git commit -m "chore(criticos): verificacion final — todos los 8 criticos de auditoria corregidos"
```
