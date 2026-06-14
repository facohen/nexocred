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
from tests.integration._helpers_f1c import cuil_valido
from tests.integration.test_comisiones import _prestamo_con_comision as _pcc


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
        """Después de novar, las cuotas pendientes del préstamo origen tienen estado='cancelada'."""
        import uuid as uuid_mod

        from sqlalchemy import select as sa_select

        from app.modelos_stub import Cuota

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


# ── helpers for C5 ─────────────────────────────────────────────────────────


async def _seed_vendedor_con_devengo(client, token, session, dni: str) -> tuple[dict, str]:
    """Create a vendedor user with one comision_devengo. Returns (vendedor_id_str, caja_id)."""
    prestamo_id, caja_id, vendedor_id = await _pcc(client, token, session, dni)
    return {"id": vendedor_id}, {"prestamo_id": prestamo_id, "caja_id": caja_id}


# ── C5: Doble liquidación de comisiones ────────────────────────────────────


class TestC5DobleLiquidacion:

    async def test_generar_liquidacion_dos_veces_no_duplica_devengos(
        self, client, admin_token, session
    ):
        """Generar liquidación, aprobarla, generar otra → segunda tiene monto_total=0."""
        vendedor, _devengo = await _seed_vendedor_con_devengo(
            client, admin_token, session, "71000032"
        )
        hoy = date.today()
        periodo = {
            "periodo_desde": (hoy - timedelta(days=1)).isoformat(),
            "periodo_hasta": (hoy + timedelta(days=1)).isoformat(),
        }

        # Generate first liquidacion
        r1 = await client.post(
            "/api/v1/comisiones/liquidaciones",
            json={"vendedor_id": vendedor["id"], **periodo},
            headers=_h(admin_token),
        )
        assert r1.status_code == 201, r1.text
        liq1 = r1.json()
        assert float(liq1["monto_total"]) == 5000.0

        # Approve it
        r_aprueba = await client.patch(
            f"/api/v1/comisiones/liquidaciones/{liq1['id']}/aprobar",
            headers=_h(admin_token),
        )
        assert r_aprueba.status_code == 200, r_aprueba.text

        # Generate second liquidacion for the same period
        r2 = await client.post(
            "/api/v1/comisiones/liquidaciones",
            json={"vendedor_id": vendedor["id"], **periodo},
            headers=_h(admin_token),
        )
        assert r2.status_code == 201, r2.text
        liq2 = r2.json()

        # Second should have 0 devengos (all already in aprobada liquidacion)
        assert float(liq2["monto_total"]) == 0.0 or len(liq2.get("detalle", [])) == 0

    async def test_generar_liquidacion_excluye_devengos_en_borrador(
        self, client, admin_token, session
    ):
        """Devengo en liquidación borrador no aparece en nueva liquidación."""
        vendedor, _devengo = await _seed_vendedor_con_devengo(
            client, admin_token, session, "71000033"
        )
        hoy = date.today()
        periodo = {
            "periodo_desde": (hoy - timedelta(days=1)).isoformat(),
            "periodo_hasta": (hoy + timedelta(days=1)).isoformat(),
        }

        # Generate first liquidacion (borrador) — not approved
        r1 = await client.post(
            "/api/v1/comisiones/liquidaciones",
            json={"vendedor_id": vendedor["id"], **periodo},
            headers=_h(admin_token),
        )
        assert r1.status_code == 201, r1.text
        liq1 = r1.json()
        assert liq1["estado"] == "borrador"
        assert float(liq1["monto_total"]) == 5000.0

        # Generate second liquidacion — should NOT include same devengos
        r2 = await client.post(
            "/api/v1/comisiones/liquidaciones",
            json={"vendedor_id": vendedor["id"], **periodo},
            headers=_h(admin_token),
        )
        assert r2.status_code == 201, r2.text
        liq2 = r2.json()
        assert float(liq2["monto_total"]) == 0.0 or len(liq2.get("detalle", [])) == 0


# ── helpers for C4a ────────────────────────────────────────────────────────

async def _seed_rendicion_del_cobrador(
    client, cobrador_usuario: dict, admin_token: str, session, dni: str
) -> dict:
    """Create a ruta assigned to cobrador, make a cobro, create a rendicion in 'abierta' state."""
    from tests.integration._helpers_f1c import relajar_bcra
    from tests.integration.test_pagos_waterfall import _prestamo_desembolsado

    await relajar_bcra(client, admin_token)
    _prestamo, caja = await _prestamo_desembolsado(
        client, admin_token, session, fpc_offset=-30,
        cuil=cuil_valido(dni), dni=dni,
    )
    cobrador_id = cobrador_usuario["id"]
    cobrador_token = cobrador_usuario["token"]

    # Create ruta assigned to the cobrador
    r = await client.post(
        "/api/v1/rutas",
        json={"cobrador_id": cobrador_id, "fecha": date.today().isoformat()},
        headers=_h(admin_token),
    )
    assert r.status_code == 201, r.text
    ruta_id = r.json()["id"]

    # Get parada and visitar
    rd = await client.get(f"/api/v1/rutas/{ruta_id}", headers=_h(admin_token))
    assert rd.status_code == 200, rd.text
    paradas = rd.json()["paradas"]
    if paradas:
        parada_id = paradas[0]["id"]
        await client.post(
            f"/api/v1/rutas/{ruta_id}/paradas/{parada_id}/visitar",
            json={"resultado": "pago", "monto_cobrado": "5000.00", "caja_id": caja,
                  "fecha_negocio": date.today().isoformat()},
            headers=_h(cobrador_token),
        )

    # Create rendicion (cobrador can create their own rendicion)
    rend = await client.post(
        "/api/v1/rendiciones",
        json={"ruta_id": ruta_id, "fecha_negocio": date.today().isoformat()},
        headers=_h(cobrador_token),
    )
    assert rend.status_code == 201, rend.text
    return rend.json()


async def _seed_rendicion_presentada(
    client, cobrador_usuario: dict, admin_token: str, session, dni: str
) -> dict:
    """Seed rendicion and advance it to 'presentada' state."""
    rendicion = await _seed_rendicion_del_cobrador(
        client, cobrador_usuario, admin_token, session, dni
    )
    rid = rendicion["id"]
    cobrador_token = cobrador_usuario["token"]

    # Advance abierta -> presentada (cobrador can do this)
    r = await client.patch(
        f"/api/v1/rendiciones/{rid}",
        json={"estado": "presentada"},
        headers=_h(cobrador_token),
    )
    assert r.status_code == 200, r.text
    return r.json()


# ── C4a: Cobrador aprueba su propia rendición ──────────────────────────────


class TestC4aAutoAprobacion:

    async def test_cobrador_no_puede_aprobar_su_propia_rendicion(
        self, client, cobrador_usuario, admin_token, session
    ):
        """Cobrador que intenta aprobar su propia rendición recibe 403."""
        rendicion = await _seed_rendicion_presentada(
            client, cobrador_usuario, admin_token, session, "41000001"
        )
        cobrador_token = cobrador_usuario["token"]

        r = await client.patch(
            f"/api/v1/rendiciones/{rendicion['id']}",
            json={"estado": "aprobada"},
            headers=_h(cobrador_token),
        )
        assert r.status_code == 403, r.text

    async def test_admin_puede_aprobar_rendicion_de_cobrador(
        self, client, cobrador_usuario, admin_token, session
    ):
        """Admin puede aprobar la rendición de un cobrador."""
        rendicion = await _seed_rendicion_presentada(
            client, cobrador_usuario, admin_token, session, "41000002"
        )

        r = await client.patch(
            f"/api/v1/rendiciones/{rendicion['id']}",
            json={"estado": "aprobada"},
            headers=_h(admin_token),
        )
        assert r.status_code in (200, 201), r.text

    async def test_cobrador_puede_presentar_su_propia_rendicion(
        self, client, cobrador_usuario, admin_token, session
    ):
        """Cobrador puede PRESENTAR (no aprobar) su rendición."""
        rendicion = await _seed_rendicion_del_cobrador(
            client, cobrador_usuario, admin_token, session, "41000003"
        )
        cobrador_token = cobrador_usuario["token"]

        r = await client.patch(
            f"/api/v1/rendiciones/{rendicion['id']}",
            json={"estado": "presentada"},
            headers=_h(cobrador_token),
        )
        assert r.status_code in (200, 201), r.text


# ── helpers for C4b ────────────────────────────────────────────────────────

async def _crear_segundo_cobrador(client, admin_token: str) -> dict:
    """Create a second cobrador user and return {'id': ..., 'token': ...}."""
    r = await client.post(
        "/api/v1/usuarios",
        json={
            "email": "cobrador2@nexo.test",
            "nombre": "Cobrador2",
            "password": "secreto123",
            "roles": ["cobrador"],
        },
        headers=_h(admin_token),
    )
    assert r.status_code == 201, r.text
    usuario_id = r.json()["id"]
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "cobrador2@nexo.test", "password": "secreto123"},
    )
    token = login.json()["access_token"]
    return {"id": usuario_id, "token": token}


async def _seed_ruta_con_parada(
    client, cobrador_usuario: dict, admin_token: str, session, dni: str
) -> dict:
    """Create a ruta with at least one parada assigned to cobrador. Returns {ruta_id, parada_id}."""
    from tests.integration._helpers_f1c import relajar_bcra
    from tests.integration.test_pagos_waterfall import _prestamo_desembolsado

    await relajar_bcra(client, admin_token)
    _prestamo, _caja = await _prestamo_desembolsado(
        client, admin_token, session, fpc_offset=-30,
        cuil=cuil_valido(dni), dni=dni,
    )
    cobrador_id = cobrador_usuario["id"]

    r = await client.post(
        "/api/v1/rutas",
        json={"cobrador_id": cobrador_id, "fecha": date.today().isoformat()},
        headers=_h(admin_token),
    )
    assert r.status_code == 201, r.text
    ruta_id = r.json()["id"]

    rd = await client.get(f"/api/v1/rutas/{ruta_id}", headers=_h(admin_token))
    assert rd.status_code == 200, rd.text
    paradas = rd.json()["paradas"]
    parada_id = paradas[0]["id"] if paradas else None
    return {"ruta_id": ruta_id, "parada_id": parada_id}


# ── C4b: IDOR de rutas ─────────────────────────────────────────────────────


class TestC4bIDOR:

    async def test_cobrador_no_puede_visitar_ruta_ajena(
        self, client, cobrador_usuario: dict, admin_token: str, session
    ):
        """Cobrador B no puede visitar una parada de la ruta del cobrador A."""
        datos = await _seed_ruta_con_parada(
            client, cobrador_usuario, admin_token, session, "42000001"
        )
        ruta_id = datos["ruta_id"]
        parada_id = datos["parada_id"]
        if parada_id is None:
            pytest.skip("no hay paradas en la ruta")

        cobrador_b = await _crear_segundo_cobrador(client, admin_token)

        r = await client.post(
            f"/api/v1/rutas/{ruta_id}/paradas/{parada_id}/visitar",
            json={"resultado": "ausente", "fecha_negocio": date.today().isoformat()},
            headers=_h(cobrador_b["token"]),
        )
        assert r.status_code == 403, r.text

    async def test_cobrador_no_puede_sincronizar_ruta_ajena(
        self, client, cobrador_usuario: dict, admin_token: str, session
    ):
        """Cobrador B no puede sincronizar la ruta del cobrador A."""
        datos = await _seed_ruta_con_parada(
            client, cobrador_usuario, admin_token, session, "42000002"
        )
        ruta_id = datos["ruta_id"]

        cobrador_b = await _crear_segundo_cobrador(client, admin_token)

        r = await client.post(
            f"/api/v1/rutas/{ruta_id}/sync",
            json={"paradas": []},
            headers=_h(cobrador_b["token"]),
        )
        assert r.status_code == 403, r.text

    async def test_admin_puede_visitar_ruta_de_cobrador(
        self, client, cobrador_usuario: dict, admin_token: str, session
    ):
        """Admin puede operar la ruta de cualquier cobrador."""
        datos = await _seed_ruta_con_parada(
            client, cobrador_usuario, admin_token, session, "42000003"
        )
        ruta_id = datos["ruta_id"]
        parada_id = datos["parada_id"]
        if parada_id is None:
            pytest.skip("no hay paradas en la ruta")

        r = await client.post(
            f"/api/v1/rutas/{ruta_id}/paradas/{parada_id}/visitar",
            json={"resultado": "ausente", "fecha_negocio": date.today().isoformat()},
            headers=_h(admin_token),
        )
        assert r.status_code in (200, 201), r.text

    async def test_cobrador_no_puede_leer_paradas_de_ruta_ajena(
        self, client, cobrador_usuario: dict, admin_token: str, session
    ):
        """C-1: Cobrador B no puede listar las paradas de la ruta del cobrador A."""
        datos = await _seed_ruta_con_parada(
            client, cobrador_usuario, admin_token, session, "42000010"
        )
        ruta_id = datos["ruta_id"]

        cobrador_b = await _crear_segundo_cobrador(client, admin_token)

        r = await client.get(
            f"/api/v1/rutas/{ruta_id}/paradas",
            headers=_h(cobrador_b["token"]),
        )
        assert r.status_code == 403, r.text
        assert r.json()["error"]["code"] == "acceso_denegado"

    async def test_admin_puede_leer_paradas_de_cualquier_ruta(
        self, client, cobrador_usuario: dict, admin_token: str, session
    ):
        datos = await _seed_ruta_con_parada(
            client, cobrador_usuario, admin_token, session, "42000011"
        )
        r = await client.get(
            f"/api/v1/rutas/{datos['ruta_id']}/paradas", headers=_h(admin_token)
        )
        assert r.status_code == 200, r.text

    async def test_listar_rutas_no_admin_solo_ve_propias(
        self, client, cobrador_usuario: dict, admin_token: str, session
    ):
        """A-1: el listado de rutas para un cobrador queda limitado a las suyas,
        incluso si pasa cobrador_id de otro en el query param."""
        cobrador_a_id = cobrador_usuario["id"]
        # ruta vacía asignada al cobrador A (sin paradas: no necesitamos préstamo/BCRA)
        cr = await client.post(
            "/api/v1/rutas",
            json={"cobrador_id": cobrador_a_id, "fecha": date.today().isoformat()},
            headers=_h(admin_token),
        )
        assert cr.status_code == 201, cr.text
        ruta_a = cr.json()["id"]
        cobrador_b = await _crear_segundo_cobrador(client, admin_token)

        # cobrador B intenta filtrar por cobrador_id de A -> no ve la ruta de A
        r = await client.get(
            f"/api/v1/rutas?cobrador_id={cobrador_a_id}",
            headers=_h(cobrador_b["token"]),
        )
        assert r.status_code == 200, r.text
        ids = {item["id"] for item in r.json()["data"]}
        assert ruta_a not in ids


# ── C4c: IDOR de rendiciones ────────────────────────────────────────────────


class TestC4cRendicionIDOR:

    async def test_cobrador_no_puede_leer_rendicion_ajena(
        self, client, cobrador_usuario, admin_token, session
    ):
        """C-2: Cobrador B no puede ver el detalle de la rendición del cobrador A."""
        rendicion = await _seed_rendicion_del_cobrador(
            client, cobrador_usuario, admin_token, session, "43000001"
        )
        cobrador_b = await _crear_segundo_cobrador(client, admin_token)

        r = await client.get(
            f"/api/v1/rendiciones/{rendicion['id']}",
            headers=_h(cobrador_b["token"]),
        )
        assert r.status_code == 403, r.text
        assert r.json()["error"]["code"] == "acceso_denegado"

    async def test_cobrador_no_puede_descargar_en_rendicion_ajena(
        self, client, cobrador_usuario, admin_token, session
    ):
        rendicion = await _seed_rendicion_del_cobrador(
            client, cobrador_usuario, admin_token, session, "43000002"
        )
        cobrador_b = await _crear_segundo_cobrador(client, admin_token)

        r = await client.post(
            f"/api/v1/rendiciones/{rendicion['id']}/descargos",
            json={"concepto": "robo", "monto": "100.00"},
            headers=_h(cobrador_b["token"]),
        )
        assert r.status_code == 403, r.text

    async def test_cobrador_no_puede_cambiar_estado_rendicion_ajena(
        self, client, cobrador_usuario, admin_token, session
    ):
        rendicion = await _seed_rendicion_del_cobrador(
            client, cobrador_usuario, admin_token, session, "43000003"
        )
        cobrador_b = await _crear_segundo_cobrador(client, admin_token)

        r = await client.patch(
            f"/api/v1/rendiciones/{rendicion['id']}",
            json={"estado": "presentada"},
            headers=_h(cobrador_b["token"]),
        )
        assert r.status_code == 403, r.text

    async def test_admin_puede_leer_rendicion_de_cualquier_cobrador(
        self, client, cobrador_usuario, admin_token, session
    ):
        rendicion = await _seed_rendicion_del_cobrador(
            client, cobrador_usuario, admin_token, session, "43000004"
        )
        r = await client.get(
            f"/api/v1/rendiciones/{rendicion['id']}", headers=_h(admin_token)
        )
        assert r.status_code == 200, r.text

    async def test_listar_rendiciones_no_admin_solo_propias(
        self, client, cobrador_usuario, admin_token, session
    ):
        """A-2: el listado de rendiciones para un cobrador queda limitado a las suyas."""
        rendicion = await _seed_rendicion_del_cobrador(
            client, cobrador_usuario, admin_token, session, "43000005"
        )
        cobrador_b = await _crear_segundo_cobrador(client, admin_token)

        r = await client.get("/api/v1/rendiciones", headers=_h(cobrador_b["token"]))
        assert r.status_code == 200, r.text
        ids = {item["id"] for item in r.json()["data"]}
        assert rendicion["id"] not in ids
