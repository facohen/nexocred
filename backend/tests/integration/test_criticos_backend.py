"""Tests for critical audit findings (C1: doble desembolso)."""
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
