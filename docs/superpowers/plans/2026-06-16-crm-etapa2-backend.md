# CRM Etapa 2 — Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire geographic FKs into `Persona`, propagate `zona_id`/`sector_id` into `SolicitudCredito` filters, fix the snapshot to embed `codigo` strings (not UUIDs), and add test coverage for all three surfaces.

**Architecture:** Three independent surfaces — (A) Persona gains `provincia_nombre`/`localidad_nombre` derived fields in its schema/service layer; (B) `query_solicitudes` gains `zona_id`/`sector_id` filter params and the router exposes them as query params; (C) `materializar_prestamo` and `desembolsar` are fixed to embed the Zona/Sector `codigo` string (not UUID) in `snapshot_terminos["zona"]`/`["sector"]` so JSONB text queries in `query_prestamos` work correctly. All are additive; no existing columns/tables need dropping.

**Tech Stack:** FastAPI, SQLAlchemy 2.x async (`Mapped`/`mapped_column`), Pydantic v2, PostgreSQL, pytest-asyncio, httpx AsyncClient.

---

## Context: What Is Already Done

The following already exist — **do not re-implement**:

| What | Where |
|------|-------|
| Migrations `0010_persona_ubicacion_fk` and `0011_solicitud_zona_sector` | `alembic/versions/` |
| `Persona.provincia_id`, `Persona.localidad_id` columns | `app/m01_personas/modelos.py` |
| `PersonaCreate.provincia_id/localidad_id` fields | `app/m01_personas/schemas.py` |
| `PersonaUpdate.provincia_id/localidad_id` fields | `app/m01_personas/schemas.py` |
| `PersonaOut.provincia_id/localidad_id` fields | `app/m01_personas/schemas.py` |
| `_validar_ubicacion()` — validates localidad↔provincia coherence | `app/m01_personas/servicio.py` |
| `SolicitudCreate/SolicitudOut.zona_id/sector_id` | `app/m02_originacion/schemas.py` |
| `crear_solicitud()` — auto-populates zona/sector from `AsignacionVendedor` | `app/m02_originacion/servicio.py` |
| `materializar_prestamo()` — accepts `zona_id`/`sector_id` params | `app/m02_originacion/servicio_desembolso.py` |
| Novaciones — inherit zona/sector from origin snapshot | `app/m06_novaciones/servicio.py` |
| `query_prestamos()` — filters by `snapshot_terminos["zona"].astext` | `app/m03_prestamos/servicio.py` |
| `GET /prestamos` — exposes `?zona=` and `?sector=` query params | `app/m03_prestamos/router.py` |
| `SolicitudCredito.zona_id/sector_id` columns | `app/modelos_stub.py` |

**What is still missing (this plan implements):**

1. `PersonaOut` is missing `provincia_nombre` / `localidad_nombre` derived string fields.
2. `PersonaOut` serialization in `obtener_persona()` / router doesn't populate those names from the joined relationship.
3. `query_solicitudes()` ignores `zona_id` and `sector_id` — no filter applied.
4. `GET /solicitudes` router endpoint has no `zona_id` or `sector_id` query params.
5. `materializar_prestamo()` writes `str(zona_id)` (a UUID string) into `snapshot_terminos["zona"]` — but `query_prestamos()` does `.astext == zona` expecting a `codigo` like `"norte"`. **This means zona/sector snapshot filtering is currently broken end-to-end.**
6. `desembolsar()` in `servicio_desembolso.py` has its own inline copy of the snap-writing logic (lines 128–131) that also writes UUID strings — same bug.
7. No tests for `provincia_id`/`localidad_id` on persona endpoints.
8. No tests for `zona_id`/`sector_id` autopoblado on solicitud creation.
9. No tests confirming `snapshot_terminos` contains `"zona"` and `"sector"` after desembolso.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `app/m01_personas/schemas.py` | Modify | Add `provincia_nombre`/`localidad_nombre` to `PersonaOut` |
| `app/m01_personas/servicio.py` | Modify | `obtener_persona()` and `listar_personas()` eager-load province/localidad and populate names |
| `app/m01_personas/modelos.py` | Modify | Add `selectin` relationships to `Provincia`/`Localidad` on `Persona` |
| `app/m02_originacion/servicio.py` | Modify | `query_solicitudes()` — add `zona_id`/`sector_id` filter params |
| `app/m02_originacion/router.py` | Modify | `GET /solicitudes` — add `zona_id`/`sector_id` `Query` params, pass to service |
| `app/m02_originacion/servicio_desembolso.py` | Modify | Fix: look up `Zona.codigo`/`Sector.codigo` before writing to snap in both `materializar_prestamo()` and `desembolsar()` |
| `app/m06_novaciones/servicio.py` | Modify | Fix: when rebuilding `zona_id`/`sector_id` from snap, the value is now a `codigo` string — parse accordingly |
| `tests/api/test_personas.py` | Modify | Add 3 tests: valid ubicacion, mismatched localidad, no ubicacion |
| `tests/integration/test_crm_etapa2.py` | Create | Integration tests: zona/sector autopoblado; snapshot content |

---

## Task 1: Persona — relationships to Provincia/Localidad on the model

**Files:**
- Modify: `app/m01_personas/modelos.py`

The `Persona` model already has `provincia_id` and `localidad_id` FK columns. Add `relationship()` to the `Provincia` and `Localidad` models so the ORM can eager-load the names without extra queries.

- [ ] **Step 1: Read the file before editing**

```bash
head -20 /Users/fede/repos/nexocred/backend/app/m01_personas/modelos.py
```

Expected: see `from sqlalchemy.orm import Mapped, mapped_column, relationship` already imported.

- [ ] **Step 2: Add the relationships to `Persona`**

In `app/m01_personas/modelos.py`, add two imports and two relationships. The existing imports block starts with `from sqlalchemy.orm import ...`. Add `Provincia` and `Localidad` to the import from `app.m16_maestros.modelos`, then add the relationships to `Persona` after the existing `referido_por_id` column:

Find this block (exact text to replace — it's after the `activo` column and before `referencias_rel`):

```python
    referido_por_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("persona.id"))
    redes_sociales: Mapped[dict | None] = mapped_column(JSONB)
    # Control
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")

    referencias_rel: Mapped[list["PersonaReferencia"]] = relationship(
        cascade="all, delete-orphan", lazy="selectin"
    )
```

Replace with:

```python
    referido_por_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("persona.id"))
    redes_sociales: Mapped[dict | None] = mapped_column(JSONB)
    # Control
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")

    referencias_rel: Mapped[list["PersonaReferencia"]] = relationship(
        cascade="all, delete-orphan", lazy="selectin"
    )
    provincia_rel: Mapped["Provincia | None"] = relationship(
        "Provincia", foreign_keys=[provincia_id], lazy="selectin"
    )
    localidad_rel: Mapped["Localidad | None"] = relationship(
        "Localidad", foreign_keys=[localidad_id], lazy="selectin"
    )
```

> Note: `"Provincia"` and `"Localidad"` are forward-reference strings — SQLAlchemy resolves them at mapper configuration time. No import of these classes into `modelos.py` is needed (avoids a circular import since `m16_maestros` doesn't import from `m01_personas`). If SQLAlchemy cannot resolve the forward reference (mapper config order issue), add `from app.m16_maestros.modelos import Provincia, Localidad` at the top of the file instead.

- [ ] **Step 3: Verify no import error**

```bash
cd /Users/fede/repos/nexocred/backend && python -c "from app.m01_personas.modelos import Persona; print('ok')"
```

Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add backend/app/m01_personas/modelos.py
git commit -m "feat(personas): add selectin relationships to Provincia and Localidad on Persona"
```

---

## Task 2: PersonaOut — add `provincia_nombre` / `localidad_nombre` derived fields

**Files:**
- Modify: `app/m01_personas/schemas.py`

`PersonaOut` currently has `provincia_id: uuid.UUID | None` and `localidad_id: uuid.UUID | None`. The spec also requires `provincia_nombre: str | None` and `localidad_nombre: str | None` derived from the join.

- [ ] **Step 1: Add fields to `PersonaOut`**

In `app/m01_personas/schemas.py`, find the existing `PersonaOut` class. Locate the two FK fields and add the name fields after them:

Find (exact text):
```python
    provincia_id: uuid.UUID | None = None
    localidad_id: uuid.UUID | None = None
    referencias: list[ReferenciaOut] = Field(default_factory=list)
```

Replace with:
```python
    provincia_id: uuid.UUID | None = None
    localidad_id: uuid.UUID | None = None
    provincia_nombre: str | None = None
    localidad_nombre: str | None = None
    referencias: list[ReferenciaOut] = Field(default_factory=list)
```

- [ ] **Step 2: Update the router to populate derived names**

The router currently does `PersonaOut.model_validate(persona)` which uses `from_attributes=True`. Since `PersonaOut` now has `provincia_nombre`/`localidad_nombre` but `Persona` has `provincia_rel.nombre`/`localidad_rel.nombre`, we need a helper that populates those.

In `app/m01_personas/router.py`, add a private helper after the imports:

```python
def _persona_out(persona) -> PersonaOut:
    out = PersonaOut.model_validate(persona)
    if persona.provincia_rel is not None:
        out.provincia_nombre = persona.provincia_rel.nombre
    if persona.localidad_rel is not None:
        out.localidad_nombre = persona.localidad_rel.nombre
    return out
```

Then replace every `PersonaOut.model_validate(persona)` call in the router with `_persona_out(persona)`.

The router has these occurrences (search with: `grep -n "PersonaOut.model_validate" app/m01_personas/router.py`):
- After `POST /personas`
- After `GET /personas/{id}`
- After `PATCH /personas/{id}`

Replace each one.

- [ ] **Step 3: Verify syntax**

```bash
cd /Users/fede/repos/nexocred/backend && python -c "from app.m01_personas.schemas import PersonaOut; print(PersonaOut.model_fields.keys())"
```

Expected output includes `provincia_nombre` and `localidad_nombre`.

- [ ] **Step 4: Commit**

```bash
git add backend/app/m01_personas/schemas.py backend/app/m01_personas/router.py
git commit -m "feat(personas): add provincia_nombre/localidad_nombre derived fields to PersonaOut"
```

---

## Task 3: Fix snapshot — write `codigo` string instead of UUID in `materializar_prestamo` and `desembolsar`

**Files:**
- Modify: `app/m02_originacion/servicio_desembolso.py`

**The bug:** Both `materializar_prestamo()` and `desembolsar()` write `str(zona_id)` (a UUID string like `"3d7f…"`) into `snapshot_terminos["zona"]`. But `query_prestamos()` in `m03_prestamos/servicio.py` filters by `Prestamo.snapshot_terminos["zona"].astext == zona` where `zona` is a plain string code like `"norte"`. This means `GET /prestamos?zona=norte` always returns zero results on any real desembolso. The fix is to look up the `Zona.codigo`/`Sector.codigo` before writing.

- [ ] **Step 1: Read the current file**

```bash
sed -n '1,50p' /Users/fede/repos/nexocred/backend/app/m02_originacion/servicio_desembolso.py
```

Expected: see `from app.modelos_stub import Cuota, MovimientoCaja, Prestamo, SolicitudCredito`

- [ ] **Step 2: Add Zona/Sector imports**

In `app/m02_originacion/servicio_desembolso.py`, add to the imports block:

Find:
```python
from app.modelos_stub import Cuota, MovimientoCaja, Prestamo, SolicitudCredito
```

Replace with:
```python
from app.m16_maestros.modelos import Sector, Zona
from app.modelos_stub import Cuota, MovimientoCaja, Prestamo, SolicitudCredito
```

- [ ] **Step 3: Add helper to resolve codigo**

After the `_fecha_primera_cuota_default` function, add:

```python
async def _codigo_zona(session: AsyncSession, zona_id: uuid.UUID | None) -> str | None:
    if zona_id is None:
        return None
    res = await session.execute(select(Zona.codigo).where(Zona.id == zona_id))
    return res.scalar_one_or_none()


async def _codigo_sector(session: AsyncSession, sector_id: uuid.UUID | None) -> str | None:
    if sector_id is None:
        return None
    res = await session.execute(select(Sector.codigo).where(Sector.id == sector_id))
    return res.scalar_one_or_none()
```

- [ ] **Step 4: Fix `materializar_prestamo()`**

Inside `materializar_prestamo()`, find:

```python
    crono = calcular_cronograma(terminos)
    snap = snapshot_desde_terminos(terminos)
    if zona_id is not None:
        snap["zona"] = str(zona_id)
    if sector_id is not None:
        snap["sector"] = str(sector_id)
```

Replace with:

```python
    crono = calcular_cronograma(terminos)
    snap = snapshot_desde_terminos(terminos)
    zona_codigo = await _codigo_zona(session, zona_id)
    sector_codigo = await _codigo_sector(session, sector_id)
    if zona_codigo is not None:
        snap["zona"] = zona_codigo
    if sector_codigo is not None:
        snap["sector"] = sector_codigo
```

- [ ] **Step 5: Fix `desembolsar()` — remove its inline duplicate snap-writing**

Inside `desembolsar()`, find the inline block that duplicates the logic (it builds its own `Prestamo` row directly without calling `materializar_prestamo`). Locate:

```python
    snap = snapshot_desde_terminos(terminos)
    if solicitud.zona_id is not None:
        snap["zona"] = str(solicitud.zona_id)
    if solicitud.sector_id is not None:
        snap["sector"] = str(solicitud.sector_id)
    prestamo = Prestamo(
        persona_id=solicitud.persona_id,
        producto_id=solicitud.producto_id,
        solicitud_id=solicitud.id,
        capital=terminos.capital,
        estado="vigente",
        snapshot_terminos=snap,
        fecha_desembolso=fneg,
        tasa_punitorio_diario=tasa_punitorio_diario,
        vendedor_id=solicitud.vendedor_id,
        monto_desembolsado=terminos.capital,
    )
    session.add(prestamo)
    await session.flush()

    for fila in crono.filas:
        session.add(
            Cuota(
                prestamo_id=prestamo.id,
                numero=fila.numero,
                vencimiento=fila.vencimiento,
                capital=fila.capital,
                interes=fila.interes,
                cuota=fila.cuota,
                punitorio_acumulado=Decimal("0"),
                estado="pendiente",
            )
        )
```

Replace with a call to `materializar_prestamo` (which now does the lookup correctly):

```python
    prestamo = await materializar_prestamo(
        session,
        persona_id=solicitud.persona_id,
        producto_id=solicitud.producto_id,
        solicitud_id=solicitud.id,
        terminos=terminos,
        fecha_desembolso=fneg,
        vendedor_id=solicitud.vendedor_id,
        estado="vigente",
        zona_id=solicitud.zona_id,
        sector_id=solicitud.sector_id,
    )
```

> Note: `materializar_prestamo` already calls `calcular_cronograma` internally and creates all `Cuota` rows — remove the standalone `crono = calcular_cronograma(terminos)` line if it's now only used by the deleted block. Verify by checking if `crono` is used anywhere else in `desembolsar()` after this replacement.

- [ ] **Step 6: Verify `crono` is no longer needed in `desembolsar`**

```bash
grep -n "crono" /Users/fede/repos/nexocred/backend/app/m02_originacion/servicio_desembolso.py
```

Expected: `crono` only appears inside `materializar_prestamo`, not in `desembolsar`. If `desembolsar` still has `crono = calcular_cronograma(terminos)`, delete that line.

- [ ] **Step 7: Verify syntax**

```bash
cd /Users/fede/repos/nexocred/backend && python -c "from app.m02_originacion.servicio_desembolso import desembolsar, materializar_prestamo; print('ok')"
```

Expected: `ok`

- [ ] **Step 8: Commit**

```bash
git add backend/app/m02_originacion/servicio_desembolso.py
git commit -m "fix(desembolso): embed zona/sector codigo in snapshot instead of UUID string"
```

---

## Task 4: Fix novaciones — parse `codigo` from snapshot (not UUID)

**Files:**
- Modify: `app/m06_novaciones/servicio.py`

The novaciones service currently reads `snap["zona"]` and parses it as a UUID (`uuid.UUID(snap_origen["zona"])`). After Task 3's fix, the snap now contains a `codigo` string like `"norte"`. The novaciones logic needs to pass the `zona_id` UUID to `materializar_prestamo`, but the snap no longer stores UUIDs — it stores codes. We need to look up the UUID from the code.

- [ ] **Step 1: Audit the current novaciones snap-reading pattern**

```bash
grep -n 'snap\["zona"\]\|snap_origen\["zona"\]\|zona_id_nov\|sector_id_nov' /Users/fede/repos/nexocred/backend/app/m06_novaciones/servicio.py
```

Expected: 4+ occurrences like `zona_id_nov = uuid.UUID(snap_origen["zona"]) if "zona" in snap_origen else None`.

- [ ] **Step 2: Add helper to resolve UUID from codigo**

In `app/m06_novaciones/servicio.py`, add imports for `Zona`/`Sector` and a helper:

Find the imports block (has `from app.m02_originacion.servicio_desembolso import materializar_prestamo`). Add:

```python
from app.m16_maestros.modelos import Sector, Zona
```

Then add this helper after `_payoff_total`:

```python
async def _zona_sector_de_snap(
    session: AsyncSession, snap: dict
) -> tuple[uuid.UUID | None, uuid.UUID | None]:
    """Resolve zona_id/sector_id UUIDs from snapshot codigo strings."""
    zona_id: uuid.UUID | None = None
    sector_id: uuid.UUID | None = None
    if "zona" in snap:
        res = await session.execute(select(Zona.id).where(Zona.codigo == snap["zona"]))
        zona_id = res.scalar_one_or_none()
    if "sector" in snap:
        res = await session.execute(select(Sector.id).where(Sector.codigo == snap["sector"]))
        sector_id = res.scalar_one_or_none()
    return zona_id, sector_id
```

- [ ] **Step 3: Replace all UUID parsing in novaciones**

There are 4 spots in the file where `zona_id_nov = uuid.UUID(snap_origen["zona"]) if "zona" in snap_origen else None` appears (one per novacion operation). Replace each pair with a call to the new helper.

For each occurrence of the pattern:
```python
    zona_id_nov = uuid.UUID(snap_origen["zona"]) if "zona" in snap_origen else None
    sector_id_nov = uuid.UUID(snap_origen["sector"]) if "sector" in snap_origen else None
```

Replace with:
```python
    zona_id_nov, sector_id_nov = await _zona_sector_de_snap(session, snap_origen)
```

> Note: Some occurrences use variable name `snap` instead of `snap_origen`. Match the variable name used at that point in the code. The pattern is always two consecutive lines assigning `zona_id_nov` and `sector_id_nov`.

- [ ] **Step 4: Verify syntax**

```bash
cd /Users/fede/repos/nexocred/backend && python -c "from app.m06_novaciones.servicio import refinanciar; print('ok')"
```

Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add backend/app/m06_novaciones/servicio.py
git commit -m "fix(novaciones): resolve zona/sector UUID from codigo in snapshot (not parse as UUID)"
```

---

## Task 5: `query_solicitudes` — add `zona_id` / `sector_id` filter params

**Files:**
- Modify: `app/m02_originacion/servicio.py`
- Modify: `app/m02_originacion/router.py`

`SolicitudCredito` already has `zona_id` and `sector_id` FK columns (they are real UUID columns, not JSONB). Filtering is simple equality.

- [ ] **Step 1: Update `query_solicitudes` in servicio.py**

In `app/m02_originacion/servicio.py`, find `query_solicitudes`:

```python
def query_solicitudes(
    *,
    estado: str | None = None,
    vendedor_id: uuid.UUID | None = None,
):
    """Devuelve un Select sin ejecutar, listo para paginar_query."""
    stmt = select(SolicitudCredito).order_by(SolicitudCredito.created_at.desc())
    if estado is not None:
        stmt = stmt.where(SolicitudCredito.estado == estado)
    if vendedor_id is not None:
        stmt = stmt.where(SolicitudCredito.vendedor_id == vendedor_id)
    return stmt
```

Replace with:

```python
def query_solicitudes(
    *,
    estado: str | None = None,
    vendedor_id: uuid.UUID | None = None,
    zona_id: uuid.UUID | None = None,
    sector_id: uuid.UUID | None = None,
):
    """Devuelve un Select sin ejecutar, listo para paginar_query."""
    stmt = select(SolicitudCredito).order_by(SolicitudCredito.created_at.desc())
    if estado is not None:
        stmt = stmt.where(SolicitudCredito.estado == estado)
    if vendedor_id is not None:
        stmt = stmt.where(SolicitudCredito.vendedor_id == vendedor_id)
    if zona_id is not None:
        stmt = stmt.where(SolicitudCredito.zona_id == zona_id)
    if sector_id is not None:
        stmt = stmt.where(SolicitudCredito.sector_id == sector_id)
    return stmt
```

- [ ] **Step 2: Update `listar_solicitudes` in router.py**

In `app/m02_originacion/router.py`, find `listar_solicitudes`:

```python
async def listar_solicitudes(
    session: SessionDep,
    actor: CurrentUser,
    estado: Annotated[str | None, Query()] = None,
    vendedor_id: Annotated[uuid.UUID | None, Query()] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
) -> Pagina[SolicitudOut]:
    # Scope por vendedor: un vendedor puro solo ve lo suyo; admin/analista/ceo
    # ven todo o filtran libremente vía ?vendedor_id.
    filtro_vendedor = scope_vendedor(actor, vendedor_id)
    stmt = servicio.query_solicitudes(estado=estado, vendedor_id=filtro_vendedor)
    return await paginar_query(session, stmt, SolicitudOut.model_validate, page, per_page)
```

Replace with:

```python
async def listar_solicitudes(
    session: SessionDep,
    actor: CurrentUser,
    estado: Annotated[str | None, Query()] = None,
    vendedor_id: Annotated[uuid.UUID | None, Query()] = None,
    zona_id: Annotated[uuid.UUID | None, Query()] = None,
    sector_id: Annotated[uuid.UUID | None, Query()] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
) -> Pagina[SolicitudOut]:
    # Scope por vendedor: un vendedor puro solo ve lo suyo; admin/analista/ceo
    # ven todo o filtran libremente vía ?vendedor_id.
    filtro_vendedor = scope_vendedor(actor, vendedor_id)
    stmt = servicio.query_solicitudes(
        estado=estado,
        vendedor_id=filtro_vendedor,
        zona_id=zona_id,
        sector_id=sector_id,
    )
    return await paginar_query(session, stmt, SolicitudOut.model_validate, page, per_page)
```

- [ ] **Step 3: Verify syntax**

```bash
cd /Users/fede/repos/nexocred/backend && python -c "from app.m02_originacion.router import router; print('ok')"
```

Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add backend/app/m02_originacion/servicio.py backend/app/m02_originacion/router.py
git commit -m "feat(solicitudes): add zona_id/sector_id filter params to GET /solicitudes"
```

---

## Task 6: Tests — Persona ubicacion (personas API)

**Files:**
- Modify: `tests/api/test_personas.py`

Add 3 tests at the end of the file. The conftest provides `client` (AsyncClient) and `admin_token`. The maestros API is at `/api/v1/maestros/`.

- [ ] **Step 1: Read the end of the test file**

```bash
tail -30 /Users/fede/repos/nexocred/backend/tests/api/test_personas.py
```

Note the last test name so we can append after it.

- [ ] **Step 2: Write the failing tests first (RED)**

Append these tests to `tests/api/test_personas.py`:

```python
# ── Ubicación geográfica FK ──────────────────────────────────────────────────

async def _crear_provincia(client, token, codigo="ba", nombre="Buenos Aires") -> str:
    r = await client.post(
        "/api/v1/maestros/provincias",
        json={"codigo": codigo, "nombre": nombre},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _crear_localidad(
    client, token, provincia_id: str, codigo="spf", nombre="Springfield"
) -> str:
    r = await client.post(
        "/api/v1/maestros/localidades",
        json={"codigo": codigo, "nombre": nombre, "provincia_id": provincia_id},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def test_alta_persona_con_ubicacion_valida_201(client, admin_token):
    """Persona con provincia_id y localidad_id coherentes → 201, respuesta incluye nombres."""
    prov_id = await _crear_provincia(client, admin_token, "ba_ub1", "Buenos Aires Test")
    loc_id = await _crear_localidad(client, admin_token, prov_id, "mrp1", "Mar del Plata")
    payload = _persona_payload(cuil="20234567893", dni="23456789")
    payload["provincia_id"] = prov_id
    payload["localidad_id"] = loc_id
    r = await client.post(
        "/api/v1/personas", json=payload,
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["provincia_id"] == prov_id
    assert body["localidad_id"] == loc_id
    assert body["provincia_nombre"] == "Buenos Aires Test"
    assert body["localidad_nombre"] == "Mar del Plata"


async def test_alta_persona_localidad_de_otra_provincia_422(client, admin_token):
    """localidad_id de provincia distinta → 422 localidad_provincia_mismatch."""
    prov_a = await _crear_provincia(client, admin_token, "ba_ub2", "Provincia A")
    prov_b = await _crear_provincia(client, admin_token, "mz_ub2", "Provincia B")
    loc_de_b = await _crear_localidad(client, admin_token, prov_b, "loc_b2", "Ciudad B")
    payload = _persona_payload(cuil="20345678904", dni="34567890")
    payload["provincia_id"] = prov_a
    payload["localidad_id"] = loc_de_b
    r = await client.post(
        "/api/v1/personas", json=payload,
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 422, r.text
    assert r.json()["error"]["code"] == "localidad_provincia_mismatch"


async def test_alta_persona_sin_ubicacion_sigue_funcionando_201(client, admin_token):
    """Omitir provincia_id/localidad_id → sigue siendo 201 (retrocompat)."""
    payload = _persona_payload(cuil="20456789015", dni="45678901")
    # No province/localidad fields
    r = await client.post(
        "/api/v1/personas", json=payload,
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["provincia_id"] is None
    assert body["localidad_id"] is None
    assert body["provincia_nombre"] is None
    assert body["localidad_nombre"] is None
```

- [ ] **Step 3: Run tests — expect RED**

```bash
cd /Users/fede/repos/nexocred/backend && python -m pytest tests/api/test_personas.py::test_alta_persona_con_ubicacion_valida_201 tests/api/test_personas.py::test_alta_persona_localidad_de_otra_provincia_422 tests/api/test_personas.py::test_alta_persona_sin_ubicacion_sigue_funcionando_201 -v 2>&1 | tail -30
```

Expected: The `_crear_localidad` helper may fail if that endpoint doesn't exist yet, or the `provincia_nombre` assertion fails because Task 2 isn't done yet. The tests should FAIL for clear reasons — not import errors.

- [ ] **Step 4: Implement — complete Tasks 1 and 2 first**

Tasks 1 and 2 implement the model relationships and `PersonaOut` derived names. After completing them, re-run the tests.

- [ ] **Step 5: Run tests — expect GREEN**

```bash
cd /Users/fede/repos/nexocred/backend && python -m pytest tests/api/test_personas.py::test_alta_persona_con_ubicacion_valida_201 tests/api/test_personas.py::test_alta_persona_localidad_de_otra_provincia_422 tests/api/test_personas.py::test_alta_persona_sin_ubicacion_sigue_funcionando_201 -v 2>&1 | tail -20
```

Expected: 3 PASSED.

- [ ] **Step 6: Commit**

```bash
git add backend/tests/api/test_personas.py
git commit -m "test(personas): ubicacion FK tests — valid, mismatched province, no ubicacion"
```

---

## Task 7: Integration tests — zona/sector autopoblado + snapshot content

**Files:**
- Create: `tests/integration/test_crm_etapa2.py`

These tests exercise:
1. Creating a solicitud with a vendedor who has an active `AsignacionVendedor` → `zona_id`/`sector_id` are auto-populated.
2. Disbursing → `prestamo.snapshot_terminos` contains `"zona"` and `"sector"` as `codigo` strings (not UUIDs).

The test uses the same helper conventions as `test_originacion_vendedor.py` and `test_desembolso.py`.

- [ ] **Step 1: Write the failing tests (RED)**

Create `tests/integration/test_crm_etapa2.py`:

```python
"""CRM Etapa 2 — integration tests.

Covers:
- zona_id/sector_id auto-populated from vendedor's AsignacionVendedor vigente.
- snapshot_terminos["zona"] and ["sector"] contain codigo strings after desembolso.
- GET /solicitudes?zona_id= filters correctly.
"""

from datetime import date, timedelta

from sqlalchemy import text

from tests.api.test_solicitudes import (
    _h,
    cargar_tasa,
    crear_perfil,
    crear_persona,
    crear_producto,
    sync_bcra,
)
from tests.integration._helpers_f1c import cuil_valido, relajar_bcra
from tests.integration.test_comisiones import _crear_vendedor


# ── Helpers ─────────────────────────────────────────────────────────────────

async def _crear_zona(client, token, codigo, nombre) -> str:
    r = await client.post(
        "/api/v1/maestros/zonas",
        json={"codigo": codigo, "nombre": nombre},
        headers=_h(token),
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _crear_sector(client, token, codigo, nombre) -> str:
    r = await client.post(
        "/api/v1/maestros/sectores",
        json={"codigo": codigo, "nombre": nombre},
        headers=_h(token),
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _asignar_zona_vendedor(client, token, vendedor_id, zona_id, sector_id) -> None:
    r = await client.put(
        f"/api/v1/maestros/vendedores/{vendedor_id}/asignacion",
        json={
            "zona_id": zona_id,
            "sector_id": sector_id,
            "vigente_desde": date.today().isoformat(),
        },
        headers=_h(token),
    )
    assert r.status_code == 201, r.text


async def _crear_caja(client, token, nombre="Caja CRM") -> str:
    r = await client.post(
        "/api/v1/cajas",
        json={"nombre": nombre, "tipo": "efectivo"},
        headers=_h(token),
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _setup_persona_producto(client, token, dni_suffix: str):
    await relajar_bcra(client, token)
    persona = await crear_persona(
        client, token, cuil=cuil_valido(f"75{dni_suffix}"), dni=f"75{dni_suffix}"
    )
    producto = await crear_producto(client, token)
    perfil = await crear_perfil(client, token)
    await cargar_tasa(client, token, producto, perfil, 6, tasa="0.30")
    await sync_bcra(client, token, persona)
    return persona, producto


# ── Tests ────────────────────────────────────────────────────────────────────

async def test_solicitud_autopobla_zona_sector_de_asignacion_vendedor(
    client, admin_token, session
):
    """Vendedor con asignación vigente → solicitud hereda zona_id y sector_id."""
    zona_id = await _crear_zona(client, admin_token, "crm_e2_z1", "CRM E2 Zona 1")
    sector_id = await _crear_sector(client, admin_token, "crm_e2_s1", "CRM E2 Sector 1")
    vendedor = await _crear_vendedor(client, admin_token, "crm_e2_v1@nexo.test")
    await _asignar_zona_vendedor(
        client, admin_token, vendedor["id"], zona_id, sector_id
    )
    persona, producto = await _setup_persona_producto(client, admin_token, "000001")

    r = await client.post(
        "/api/v1/solicitudes",
        json={
            "persona_id": persona,
            "producto_id": producto,
            "monto": "100000.00",
            "cantidad_cuotas": 6,
        },
        headers=_h(vendedor["token"]),
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["zona_id"] == zona_id, "zona_id debe estar autopoblado"
    assert body["sector_id"] == sector_id, "sector_id debe estar autopoblado"

    # Confirm via DB
    res = await session.execute(
        text("SELECT zona_id, sector_id FROM solicitud_credito WHERE id=:s"),
        {"s": body["id"]},
    )
    row = res.one()
    assert str(row.zona_id) == zona_id
    assert str(row.sector_id) == sector_id


async def test_desembolso_snapshot_contiene_codigo_zona_sector(
    client, admin_token, session
):
    """Después de desembolsar, snapshot_terminos['zona'] es el codigo de zona, no un UUID."""
    zona_id = await _crear_zona(client, admin_token, "crm_e2_z2", "CRM E2 Zona 2")
    sector_id = await _crear_sector(client, admin_token, "crm_e2_s2", "CRM E2 Sector 2")
    vendedor = await _crear_vendedor(client, admin_token, "crm_e2_v2@nexo.test")
    await _asignar_zona_vendedor(
        client, admin_token, vendedor["id"], zona_id, sector_id
    )
    persona, producto = await _setup_persona_producto(client, admin_token, "000002")

    # Create solicitud as vendedor (auto-assigns zona/sector)
    r_sol = await client.post(
        "/api/v1/solicitudes",
        json={
            "persona_id": persona,
            "producto_id": producto,
            "monto": "50000.00",
            "cantidad_cuotas": 6,
        },
        headers=_h(vendedor["token"]),
    )
    assert r_sol.status_code == 201, r_sol.text
    sid = r_sol.json()["id"]

    # Evaluate + approve as admin
    await client.post(f"/api/v1/solicitudes/{sid}/evaluar", headers=_h(admin_token))
    r_ap = await client.patch(
        f"/api/v1/solicitudes/{sid}/estado",
        json={"estado": "aprobada"},
        headers=_h(admin_token),
    )
    assert r_ap.status_code == 200, r_ap.text

    # Disburse
    caja = await _crear_caja(client, admin_token, "Caja CRM E2")
    fpc = (date.today() + timedelta(days=30)).isoformat()
    r_des = await client.post(
        f"/api/v1/solicitudes/{sid}/desembolsar",
        json={
            "caja_id": caja,
            "fecha_negocio": date.today().isoformat(),
            "fecha_primera_cuota": fpc,
            "tasa_punitorio_diario": "0.001",
        },
        headers={**_h(admin_token), "Idempotency-Key": "crm-e2-des-1"},
    )
    assert r_des.status_code == 201, r_des.text
    prestamo_id = r_des.json()["prestamo_id"]

    # Assert snapshot contains codigo strings, not UUIDs
    res = await session.execute(
        text("SELECT snapshot_terminos FROM prestamo WHERE id=:p"),
        {"p": prestamo_id},
    )
    snap = res.scalar_one()
    assert "zona" in snap, "snapshot debe tener campo 'zona'"
    assert "sector" in snap, "snapshot debe tener campo 'sector'"
    assert snap["zona"] == "crm_e2_z2", (
        f"snapshot['zona'] debe ser el codigo 'crm_e2_z2', no un UUID; got: {snap['zona']}"
    )
    assert snap["sector"] == "crm_e2_s2", (
        f"snapshot['sector'] debe ser el codigo 'crm_e2_s2', no un UUID; got: {snap['sector']}"
    )


async def test_listar_solicitudes_filtra_por_zona_id(client, admin_token):
    """GET /solicitudes?zona_id= filtra por FK en solicitud_credito."""
    zona_a = await _crear_zona(client, admin_token, "crm_e2_za", "Zona Filter A")
    zona_b = await _crear_zona(client, admin_token, "crm_e2_zb", "Zona Filter B")
    sector_id = await _crear_sector(client, admin_token, "crm_e2_sf", "Sector Filter")

    vend_a = await _crear_vendedor(client, admin_token, "crm_e2_vfa@nexo.test")
    await _asignar_zona_vendedor(client, admin_token, vend_a["id"], zona_a, sector_id)

    vend_b = await _crear_vendedor(client, admin_token, "crm_e2_vfb@nexo.test")
    await _asignar_zona_vendedor(client, admin_token, vend_b["id"], zona_b, sector_id)

    persona_a, producto_a = await _setup_persona_producto(client, admin_token, "000003")
    persona_b, producto_b = await _setup_persona_producto(client, admin_token, "000004")

    # Create solicitud for vendedor_a (zone A) and vendedor_b (zone B)
    r_a = await client.post(
        "/api/v1/solicitudes",
        json={"persona_id": persona_a, "producto_id": producto_a,
              "monto": "10000.00", "cantidad_cuotas": 3},
        headers=_h(vend_a["token"]),
    )
    assert r_a.status_code == 201, r_a.text

    r_b = await client.post(
        "/api/v1/solicitudes",
        json={"persona_id": persona_b, "producto_id": producto_b,
              "monto": "10000.00", "cantidad_cuotas": 3},
        headers=_h(vend_b["token"]),
    )
    assert r_b.status_code == 201, r_b.text

    # Filter by zona_a → should return only solicitud A
    r_list = await client.get(
        f"/api/v1/solicitudes?zona_id={zona_a}", headers=_h(admin_token)
    )
    assert r_list.status_code == 200, r_list.text
    ids = [s["id"] for s in r_list.json()["data"]]
    assert r_a.json()["id"] in ids, "solicitud de zona_a debe aparecer en el filtro"
    assert r_b.json()["id"] not in ids, "solicitud de zona_b NO debe aparecer en el filtro"
```

- [ ] **Step 2: Run tests — expect RED (Tasks 3, 4, 5 not done yet)**

```bash
cd /Users/fede/repos/nexocred/backend && python -m pytest tests/integration/test_crm_etapa2.py -v 2>&1 | tail -30
```

Expected: Tests fail because `query_solicitudes` doesn't filter yet (Task 5) and snapshot has UUIDs (Task 3).

- [ ] **Step 3: After completing Tasks 3–5, run tests — expect GREEN**

```bash
cd /Users/fede/repos/nexocred/backend && python -m pytest tests/integration/test_crm_etapa2.py -v 2>&1 | tail -20
```

Expected: 3 PASSED.

- [ ] **Step 4: Commit**

```bash
git add backend/tests/integration/test_crm_etapa2.py
git commit -m "test(crm-e2): zona/sector autopoblado, snapshot codigo, filtro por zona_id"
```

---

## Task 8: Full regression — make sure nothing broke

Run the full test suites most likely to be affected:

- [ ] **Step 1: Run personas tests**

```bash
cd /Users/fede/repos/nexocred/backend && python -m pytest tests/api/test_personas.py tests/api/test_personas_referencias_marcas.py -v 2>&1 | tail -30
```

Expected: all PASSED.

- [ ] **Step 2: Run solicitudes + desembolso tests**

```bash
cd /Users/fede/repos/nexocred/backend && python -m pytest tests/api/test_solicitudes.py tests/integration/test_desembolso.py -v 2>&1 | tail -30
```

Expected: all PASSED.

- [ ] **Step 3: Run novaciones tests**

```bash
cd /Users/fede/repos/nexocred/backend && python -m pytest tests/integration/test_novaciones.py -v 2>&1 | tail -20
```

Expected: all PASSED.

- [ ] **Step 4: Run maestros tests**

```bash
cd /Users/fede/repos/nexocred/backend && python -m pytest tests/api/test_maestros.py -v 2>&1 | tail -20
```

Expected: all PASSED.

- [ ] **Step 5: Run CRM etapa 2 integration tests**

```bash
cd /Users/fede/repos/nexocred/backend && python -m pytest tests/integration/test_crm_etapa2.py -v 2>&1 | tail -20
```

Expected: 3 PASSED.

---

## Recommended Execution Order

The tasks have dependencies:

```
Task 6 (write tests RED) → Task 1 → Task 2 → Task 6 (verify GREEN)
Task 7 (write tests RED) → Task 3 → Task 4 → Task 5 → Task 7 (verify GREEN)
Task 8 (regression) — last
```

Pragmatic order: **1 → 2 → 3 → 4 → 5 → 6 → 7 → 8**

---

## Self-Review

**Spec coverage:**
- Part A (Persona geo FKs): Tasks 1, 2, 6. Schema fields already exist; only derived names + relationships missing. ✓
- Part B (Solicitud zona/sector filter): Task 5. ✓
- Part C (Snapshot point-in-time with codigo): Task 3 (materializar + desembolsar), Task 4 (novaciones). ✓
- Migrations 0010 + 0011: already exist on disk — not re-created. ✓
- Filtros en listados solicitudes: Task 5. ✓
- Filtros en listados préstamos: already implemented in `query_prestamos` + router. ✓
- Tests personas ubicacion: Task 6. ✓
- Tests integración zona/sector autopoblado + snapshot: Task 7. ✓

**Placeholder check:** None found.

**Type consistency:**
- `_persona_out()` in Task 2 references `persona.provincia_rel` / `persona.localidad_rel` — these are defined in Task 1. Task 1 must execute before Task 2's router changes go live.
- `_zona_sector_de_snap()` in Task 4 returns `(uuid.UUID | None, uuid.UUID | None)` — matches `materializar_prestamo`'s `zona_id: uuid.UUID | None` param. ✓
- Test helpers use `_h()` from `test_solicitudes` (imported) and `_crear_vendedor` from `test_comisiones` (imported) — same pattern as `test_originacion_vendedor.py`. ✓
