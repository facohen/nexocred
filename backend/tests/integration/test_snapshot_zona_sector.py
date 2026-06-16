"""Tests de integración: autopoblado de zona/sector en solicitudes y snapshot codes.

Task 7 del plan de CRM E2:
- Vendedor con asignación vigente crea solicitud → zona_id y sector_id autopoblados.
- Desembolsar esa solicitud → prestamo.snapshot_terminos["zona"] es código string (no UUID).
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
from tests.integration.test_desembolso import _crear_caja


async def _crear_zona(client, token, codigo="norte_test", nombre="Norte Test") -> str:
    r = await client.post(
        "/api/v1/maestros/zonas",
        json={"codigo": codigo, "nombre": nombre},
        headers=_h(token),
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _crear_sector(client, token, codigo="sector_test", nombre="Sector Test") -> str:
    r = await client.post(
        "/api/v1/maestros/sectores",
        json={"codigo": codigo, "nombre": nombre},
        headers=_h(token),
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _asignar_vendedor(client, token, vendedor_id, zona_id, sector_id) -> None:
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


async def _solicitud_desembolsada_con_zona(
    client, admin_token, session, dni, zona_codigo, sector_codigo
):
    """Helper: crea zona/sector, asigna vendedor, origina y desembolsa un préstamo."""
    await relajar_bcra(client, admin_token)
    persona = await crear_persona(client, admin_token, cuil=cuil_valido(dni), dni=dni)
    producto = await crear_producto(client, admin_token)
    perfil = await crear_perfil(client, admin_token)
    await cargar_tasa(client, admin_token, producto, perfil, 6, tasa="0.30")
    await sync_bcra(client, admin_token, persona)

    vendedor = await _crear_vendedor(client, admin_token, f"snap_{dni}@nexo.test")
    zona_id = await _crear_zona(client, admin_token, zona_codigo, f"Zona {zona_codigo}")
    sector_id = await _crear_sector(client, admin_token, sector_codigo, f"Sector {sector_codigo}")
    await _asignar_vendedor(client, admin_token, vendedor["id"], zona_id, sector_id)

    # Vendedor crea la solicitud — zona/sector se autopoblan desde su asignación.
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
    sol = r.json()
    sid = sol["id"]

    # Evaluar y aprobar (requiere admin).
    await client.post(f"/api/v1/solicitudes/{sid}/evaluar", headers=_h(admin_token))
    r_aprob = await client.patch(
        f"/api/v1/solicitudes/{sid}/estado",
        json={"estado": "aprobada"},
        headers=_h(admin_token),
    )
    assert r_aprob.status_code == 200, r_aprob.text

    # Desembolsar.
    caja = await _crear_caja(client, admin_token, nombre=f"Caja snap {dni}")
    fpc = (date.today() + timedelta(days=30)).isoformat()
    r_des = await client.post(
        f"/api/v1/solicitudes/{sid}/desembolsar",
        json={
            "caja_id": caja,
            "fecha_negocio": date.today().isoformat(),
            "fecha_primera_cuota": fpc,
            "tasa_punitorio_diario": "0.001",
        },
        headers={**_h(admin_token), "Idempotency-Key": f"snap-{dni}"},
    )
    assert r_des.status_code == 201, r_des.text

    return sid, zona_id, sector_id, r_des.json()["prestamo_id"]


async def test_vendedor_asignado_autopobla_zona_sector_en_solicitud(
    client, admin_token, session
):
    """Cuando un vendedor con asignación vigente crea una solicitud, la solicitud
    queda con zona_id y sector_id correspondientes a su asignación."""
    await relajar_bcra(client, admin_token)
    persona = await crear_persona(
        client, admin_token, cuil=cuil_valido("77100001"), dni="77100001"
    )
    producto = await crear_producto(client, admin_token)
    perfil = await crear_perfil(client, admin_token)
    await cargar_tasa(client, admin_token, producto, perfil, 6, tasa="0.30")
    await sync_bcra(client, admin_token, persona)

    vendedor = await _crear_vendedor(client, admin_token, "autopob_v1@nexo.test")
    zona_id = await _crear_zona(client, admin_token, "zona_autopob", "Zona Autopoblado")
    sector_id = await _crear_sector(client, admin_token, "sec_autopob", "Sector Autopoblado")
    await _asignar_vendedor(client, admin_token, vendedor["id"], zona_id, sector_id)

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
    sid = r.json()["id"]

    # Verificar en DB que zona_id y sector_id quedaron autopoblados.
    res = await session.execute(
        text("SELECT zona_id, sector_id FROM solicitud_credito WHERE id=:s"), {"s": sid}
    )
    row = res.one()
    assert str(row.zona_id) == zona_id, f"zona_id esperado {zona_id}, obtenido {row.zona_id}"
    assert str(row.sector_id) == sector_id, f"sector_id esperado {sector_id}, obtenido {row.sector_id}"


async def test_snapshot_zona_sector_es_codigo_string_no_uuid(
    client, admin_token, session
):
    """Al desembolsar, snapshot_terminos["zona"] debe ser el código string de la zona
    (ej: 'norte_snap'), NO un UUID string."""
    sid, zona_id, sector_id, prestamo_id = await _solicitud_desembolsada_con_zona(
        client, admin_token, session,
        dni="77200001",
        zona_codigo="norte_snap",
        sector_codigo="sur_snap",
    )

    # Leer el snapshot del préstamo directamente desde la DB.
    res = await session.execute(
        text("SELECT snapshot_terminos FROM prestamo WHERE id=:p"), {"p": prestamo_id}
    )
    snap = res.scalar_one()

    assert "zona" in snap, "snapshot_terminos debe contener clave 'zona'"
    assert "sector" in snap, "snapshot_terminos debe contener clave 'sector'"

    # El valor debe ser el código (string corto), no un UUID de 36 caracteres.
    assert snap["zona"] == "norte_snap", (
        f"snap['zona'] debe ser 'norte_snap', no '{snap['zona']}'"
    )
    assert snap["sector"] == "sur_snap", (
        f"snap['sector'] debe ser 'sur_snap', no '{snap['sector']}'"
    )

    # Confirmar explícitamente que NO es un UUID (longitud 36 con guiones).
    assert len(snap["zona"]) != 36, "zona en snapshot no debe ser un UUID"
    assert len(snap["sector"]) != 36, "sector en snapshot no debe ser un UUID"
