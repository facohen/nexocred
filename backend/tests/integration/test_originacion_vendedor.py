"""Originación híbrida: el vendedor crea y simula; evaluar/desembolsar siguen
restringidos a admin/analista. La solicitud creada por un vendedor queda
atribuida a su propio id (para comisiones/metas)."""

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


async def _persona_y_producto(client, token, dni):
    await relajar_bcra(client, token)
    persona = await crear_persona(client, token, cuil=cuil_valido(dni), dni=dni)
    producto = await crear_producto(client, token)
    perfil = await crear_perfil(client, token)
    await cargar_tasa(client, token, producto, perfil, 6, tasa="0.30")
    await sync_bcra(client, token, persona)
    return persona, producto


async def test_vendedor_crea_solicitud_atribuida_a_si_mismo(
    client, admin_token, session
):
    persona, producto = await _persona_y_producto(client, admin_token, "74000001")
    vendedor = await _crear_vendedor(client, admin_token, "orig_v1@nexo.test")
    r = await client.post(
        "/api/v1/solicitudes",
        json={"persona_id": persona, "producto_id": producto,
              "monto": "100000.00", "cantidad_cuotas": 6},
        headers=_h(vendedor["token"]),
    )
    assert r.status_code == 201, r.text
    sid = r.json()["id"]
    # la solicitud quedó atribuida al vendedor que la creó
    res = await session.execute(
        text("SELECT vendedor_id FROM solicitud_credito WHERE id=:s"), {"s": sid}
    )
    assert str(res.scalar_one()) == vendedor["id"]


async def test_vendedor_no_puede_originar_a_nombre_de_otro(
    client, admin_token, session
):
    """Aunque el vendedor mande vendedor_id de otro en el body, se ignora: la
    solicitud se atribuye SIEMPRE a quien la crea."""
    persona, producto = await _persona_y_producto(client, admin_token, "74000002")
    vendedor = await _crear_vendedor(client, admin_token, "orig_v2@nexo.test")
    otro = await _crear_vendedor(client, admin_token, "orig_otro@nexo.test")
    r = await client.post(
        "/api/v1/solicitudes",
        json={"persona_id": persona, "producto_id": producto,
              "monto": "100000.00", "cantidad_cuotas": 6,
              "vendedor_id": otro["id"]},
        headers=_h(vendedor["token"]),
    )
    assert r.status_code == 201, r.text
    res = await session.execute(
        text("SELECT vendedor_id FROM solicitud_credito WHERE id=:s"),
        {"s": r.json()["id"]},
    )
    assert str(res.scalar_one()) == vendedor["id"]


async def test_vendedor_puede_cotizar_con_simulador_standalone(client, admin_token):
    """El vendedor cotiza con el simulador libre (sin solicitud) durante el armado.
    El simular-oferta por-solicitud requiere evaluación previa (admin/analista)."""
    vendedor = await _crear_vendedor(client, admin_token, "orig_v3@nexo.test")
    fpc = (date.today() + timedelta(days=30)).isoformat()
    r = await client.post(
        "/api/v1/simulador/cotizador",
        json={"capital": "100000.00", "tasa_interes_directo": "0.30",
              "cantidad_cuotas": 6, "periodicidad": "mensual",
              "fecha_primera_cuota": fpc},
        headers=_h(vendedor["token"]),
    )
    assert r.status_code == 200, r.text
    assert r.json()["cantidad_cuotas"] == 6
    assert len(r.json()["cuotas"]) == 6


async def test_vendedor_no_puede_evaluar_ni_desembolsar(client, admin_token):
    persona, producto = await _persona_y_producto(client, admin_token, "74000004")
    vendedor = await _crear_vendedor(client, admin_token, "orig_v4@nexo.test")
    cr = await client.post(
        "/api/v1/solicitudes",
        json={"persona_id": persona, "producto_id": producto,
              "monto": "100000.00", "cantidad_cuotas": 6},
        headers=_h(vendedor["token"]),
    )
    sid = cr.json()["id"]
    # evaluar: 403
    ev = await client.post(
        f"/api/v1/solicitudes/{sid}/evaluar", headers=_h(vendedor["token"])
    )
    assert ev.status_code == 403, ev.text
    # desembolsar: 403 (antes de cualquier validación de idempotencia/estado)
    des = await client.post(
        f"/api/v1/solicitudes/{sid}/desembolsar",
        json={"caja_id": "00000000-0000-0000-0000-000000000000"},
        headers={**_h(vendedor["token"]), "Idempotency-Key": "x"},
    )
    assert des.status_code == 403, des.text
