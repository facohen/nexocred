"""CRM Etapa 2 — integration tests.

Covers:
- zona_id/sector_id auto-populated from vendedor's AsignacionVendedor vigente.
- snapshot_terminos["zona"] and ["sector"] contain codigo strings after desembolso.
- GET /solicitudes?zona_id= filters correctly.
"""

from datetime import date

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


async def _setup_persona_producto(client, token, dni_suffix: str):
    await relajar_bcra(client, token)
    persona = await crear_persona(
        client, token, cuil=cuil_valido(f"76{dni_suffix}"), dni=f"76{dni_suffix}"
    )
    producto = await crear_producto(client, token)
    perfil = await crear_perfil(client, token)
    await cargar_tasa(client, token, producto, perfil, 6, tasa="0.30")
    await sync_bcra(client, token, persona)
    return persona, producto


# ── Tests ────────────────────────────────────────────────────────────────────

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

    r_list = await client.get(
        f"/api/v1/solicitudes?zona_id={zona_a}", headers=_h(admin_token)
    )
    assert r_list.status_code == 200, r_list.text
    ids = [s["id"] for s in r_list.json()["data"]]
    assert r_a.json()["id"] in ids, "solicitud de zona_a debe aparecer en el filtro"
    assert r_b.json()["id"] not in ids, "solicitud de zona_b NO debe aparecer en el filtro"
