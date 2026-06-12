"""Tests for critical audit findings (C1: doble desembolso, C3: prestamo novado)."""
import uuid
from datetime import date, timedelta

import pytest
from sqlalchemy import func, select

from tests.api.test_solicitudes import (
    cargar_tasa,
    crear_perfil,
    crear_persona,
    crear_producto,
    crear_solicitud,
    sync_bcra,
)


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _crear_caja(client, token, nombre="Caja C1") -> str:
    r = await client.post(
        "/api/v1/cajas",
        json={"nombre": nombre, "tipo": "efectivo"},
        headers=_h(token),
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _seed_solicitud_aprobada(client, token, cuotas=6) -> str:
    """Create a solicitud in estado='aprobada' ready for desembolso. Returns solicitud_id."""
    persona = await crear_persona(client, token)
    producto = await crear_producto(client, token)
    perfil = await crear_perfil(client, token)
    await cargar_tasa(client, token, producto, perfil, cuotas, tasa="0.30")
    await sync_bcra(client, token, persona)
    sid = await crear_solicitud(client, token, persona, producto, cantidad_cuotas=cuotas)
    await client.post(f"/api/v1/solicitudes/{sid}/evaluar", headers=_h(token))
    r = await client.patch(
        f"/api/v1/solicitudes/{sid}/estado",
        json={"estado": "aprobada"},
        headers=_h(token),
    )
    assert r.status_code == 200, r.text
    return sid


# ── C1: Doble desembolso ────────────────────────────────────────────────────


class TestC1DobleDesembolso:

    async def test_desembolso_con_solicitud_ya_desembolsada_rechaza_409(
        self, client, admin_token
    ):
        """Una solicitud ya desembolsada no puede desembolsarse de nuevo."""
        sid = await _seed_solicitud_aprobada(client, admin_token)
        caja_id = await _crear_caja(client, admin_token, nombre="Caja C1a")
        fpc = (date.today() + timedelta(days=30)).isoformat()
        payload = {
            "caja_id": caja_id,
            "fecha_negocio": date.today().isoformat(),
            "fecha_primera_cuota": fpc,
            "tasa_punitorio_diario": "0.001",
        }

        # First desembolso — should succeed
        r1 = await client.post(
            f"/api/v1/solicitudes/{sid}/desembolsar",
            json=payload,
            headers={**_h(admin_token), "Idempotency-Key": str(uuid.uuid4())},
        )
        assert r1.status_code == 201, r1.text

        # Second desembolso with different idempotency key — should be rejected with 409
        r2 = await client.post(
            f"/api/v1/solicitudes/{sid}/desembolsar",
            json=payload,
            headers={**_h(admin_token), "Idempotency-Key": str(uuid.uuid4())},
        )
        assert r2.status_code == 409, r2.text

    async def test_desembolso_solicitud_crea_un_solo_prestamo(
        self, client, admin_token, session
    ):
        """Desembolso crea exactamente un Prestamo, incluso si se llama dos veces."""
        from app.modelos_stub import Prestamo

        sid = await _seed_solicitud_aprobada(client, admin_token)
        caja_id = await _crear_caja(client, admin_token, nombre="Caja C1b")
        fpc = (date.today() + timedelta(days=30)).isoformat()
        payload = {
            "caja_id": caja_id,
            "fecha_negocio": date.today().isoformat(),
            "fecha_primera_cuota": fpc,
            "tasa_punitorio_diario": "0.001",
        }

        # First call — should succeed
        r1 = await client.post(
            f"/api/v1/solicitudes/{sid}/desembolsar",
            json=payload,
            headers={**_h(admin_token), "Idempotency-Key": str(uuid.uuid4())},
        )
        assert r1.status_code == 201, r1.text

        # Second call (should fail with 409)
        r2 = await client.post(
            f"/api/v1/solicitudes/{sid}/desembolsar",
            json=payload,
            headers={**_h(admin_token), "Idempotency-Key": str(uuid.uuid4())},
        )
        assert r2.status_code == 409, r2.text

        # Exactly one Prestamo for this solicitud
        result = await session.execute(
            select(func.count()).select_from(Prestamo).where(
                Prestamo.solicitud_id == uuid.UUID(sid)
            )
        )
        count = result.scalar_one()
        assert count == 1, f"Expected 1 Prestamo, found {count}"


# ── helpers for C2 ─────────────────────────────────────────────────────────

async def _seed_pago_aplicado(client, token, session) -> dict:
    """Create a prestamo with one pago applied, return the pago dict."""
    from datetime import date
    from tests.integration.test_pagos_waterfall import _prestamo_desembolsado

    prestamo_id, caja_id = await _prestamo_desembolsado(client, token, session)
    r = await client.post(
        "/api/v1/pagos",
        json={
            "prestamo_id": prestamo_id,
            "monto": "10000.00",
            "canal": "mostrador",
            "caja_id": caja_id,
            "fecha_negocio": date.today().isoformat(),
        },
        headers={**_h(token), "Idempotency-Key": str(uuid.uuid4())},
    )
    assert r.status_code == 201, r.text
    pago = r.json()
    pago["caja_id"] = caja_id
    return pago


# ── C2: Doble corrección de pago ───────────────────────────────────────────


class TestC2DobleCorrección:

    async def test_corregir_pago_dos_veces_lanza_409(
        self, client, admin_token, session
    ):
        """Corregir el mismo pago dos veces retorna 409 la segunda vez."""
        from datetime import date

        pago = await _seed_pago_aplicado(client, admin_token, session)

        payload = {
            "monto": "11000.00",
            "canal": "mostrador",
            "caja_id": pago["caja_id"],
            "fecha_negocio": date.today().isoformat(),
        }

        # First correction — should succeed
        r1 = await client.post(
            f"/api/v1/pagos/{pago['id']}/corregir",
            json=payload,
            headers={**_h(admin_token), "Idempotency-Key": str(uuid.uuid4())},
        )
        assert r1.status_code in (200, 201), r1.text

        # Second correction with a different idempotency key — should fail with 409
        r2 = await client.post(
            f"/api/v1/pagos/{pago['id']}/corregir",
            json=payload,
            headers={**_h(admin_token), "Idempotency-Key": str(uuid.uuid4())},
        )
        assert r2.status_code == 409, r2.text

    async def test_corregir_pago_crea_una_sola_reversa(
        self, client, admin_token, session
    ):
        """Corregir un pago crea exactamente una reversa con monto negativo."""
        from datetime import date
        from sqlalchemy import select as sa_select
        from app.modelos_stub import Pago

        pago = await _seed_pago_aplicado(client, admin_token, session)

        r = await client.post(
            f"/api/v1/pagos/{pago['id']}/corregir",
            json={
                "monto": "11000.00",
                "canal": "mostrador",
                "caja_id": pago["caja_id"],
                "fecha_negocio": date.today().isoformat(),
            },
            headers={**_h(admin_token), "Idempotency-Key": str(uuid.uuid4())},
        )
        assert r.status_code in (200, 201), r.text

        # Count reversas (pagos with estado='reversa') linked to the original pago
        result = await session.execute(
            sa_select(Pago).where(
                Pago.corrige_pago_id == uuid.UUID(pago["id"]),
                Pago.estado == "reversa",
            )
        )
        reversas = result.scalars().all()
        assert len(reversas) == 1, f"Expected 1 reversa, found {len(reversas)}"


# ── helpers for C3 ─────────────────────────────────────────────────────────

async def _seed_prestamo_vigente(client, token, session) -> dict:
    """Create persona -> solicitud -> aprobada -> desembolsar -> return prestamo dict."""
    from tests.integration.test_pagos_waterfall import _prestamo_desembolsado

    prestamo_id, caja_id = await _prestamo_desembolsado(client, token, session)
    return {"id": prestamo_id, "caja_id": caja_id}


# ── C3: Préstamo novado sigue cobrable ─────────────────────────────────────


class TestC3PrestamoNovado:

    async def test_novar_cancela_cuotas_del_origen(
        self, client, admin_token, session
    ):
        """Después de novar, todas las cuotas pendientes del préstamo origen tienen estado='cancelada'."""
        from sqlalchemy import select as sa_select, text
        from app.modelos_stub import Cuota
        import uuid as uuid_mod

        prestamo = await _seed_prestamo_vigente(client, admin_token, session)
        fpc = (date.today() + timedelta(days=30)).isoformat()

        r = await client.post(
            "/api/v1/novaciones/refinanciar",
            json={
                "prestamo_id": prestamo["id"],
                "caja_id": prestamo["caja_id"],
                "fecha_negocio": date.today().isoformat(),
                "tasa_interes_directo": "0.20",
                "cantidad_cuotas": 12,
                "fecha_primera_cuota": fpc,
            },
            headers={**_h(admin_token), "Idempotency-Key": str(uuid.uuid4())},
        )
        assert r.status_code == 201, r.text

        # All cuotas of the origin should now be cancelada (or pagada — already settled)
        result = await session.execute(
            sa_select(Cuota).where(
                Cuota.prestamo_id == uuid_mod.UUID(prestamo["id"]),
            )
        )
        cuotas = result.scalars().all()
        assert len(cuotas) > 0, "prestamo should have cuotas"
        non_canceladas = [c for c in cuotas if c.estado not in ("cancelada", "pagada")]
        assert non_canceladas == [], (
            f"Expected all cuotas cancelada/pagada, found states: "
            f"{[c.estado for c in non_canceladas]}"
        )

    async def test_pago_sobre_prestamo_novado_rechaza_409(
        self, client, admin_token, session
    ):
        """registrar_pago sobre préstamo con estado='novado' retorna 409."""
        prestamo = await _seed_prestamo_vigente(client, admin_token, session)
        fpc = (date.today() + timedelta(days=30)).isoformat()

        # Novar first
        r = await client.post(
            "/api/v1/novaciones/refinanciar",
            json={
                "prestamo_id": prestamo["id"],
                "caja_id": prestamo["caja_id"],
                "fecha_negocio": date.today().isoformat(),
                "tasa_interes_directo": "0.20",
                "cantidad_cuotas": 12,
                "fecha_primera_cuota": fpc,
            },
            headers={**_h(admin_token), "Idempotency-Key": str(uuid.uuid4())},
        )
        assert r.status_code == 201, r.text

        # Try to register a payment on the novated loan
        r2 = await client.post(
            "/api/v1/pagos",
            json={
                "prestamo_id": prestamo["id"],
                "monto": "1000.00",
                "canal": "mostrador",
                "caja_id": prestamo["caja_id"],
                "fecha_negocio": date.today().isoformat(),
            },
            headers={**_h(admin_token), "Idempotency-Key": str(uuid.uuid4())},
        )
        assert r2.status_code == 409, r2.text

    async def test_pago_sobre_prestamo_cancelado_rechaza_409(
        self, client, admin_token, session
    ):
        """registrar_pago sobre préstamo con estado='cancelado' retorna 409."""
        from sqlalchemy import text

        prestamo = await _seed_prestamo_vigente(client, admin_token, session)

        # Directly set estado to 'cancelado' via DB
        await session.execute(
            text("UPDATE prestamo SET estado='cancelado' WHERE id=:id"),
            {"id": prestamo["id"]},
        )
        await session.commit()

        # Try to register a payment on the cancelled loan
        r = await client.post(
            "/api/v1/pagos",
            json={
                "prestamo_id": prestamo["id"],
                "monto": "1000.00",
                "canal": "mostrador",
                "caja_id": prestamo["caja_id"],
                "fecha_negocio": date.today().isoformat(),
            },
            headers={**_h(admin_token), "Idempotency-Key": str(uuid.uuid4())},
        )
        assert r.status_code == 409, r.text
