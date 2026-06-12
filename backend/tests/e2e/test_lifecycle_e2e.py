"""Task 5: smoke end-to-end del ciclo de vida completo via la API real.

persona -> BCRA -> solicitud -> evaluar -> aprobar -> desembolsar -> pago -> ruta
-> visita/sync -> rendicion -> comision (devengo en el desembolso) -> liquidacion
(generar/aprobar/pagar) -> snapshot -> torre/pulso -> documento -> correccion.

En cada paso se afirma el ESTADO y la CONSERVACION DE DINERO (posicion de caja):
cada egreso/ingreso mueve el saldo consolidado exactamente por el monto esperado.
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest

from tests.api.test_solicitudes import (
    cargar_tasa,
    crear_perfil,
    crear_persona,
    crear_producto,
    sync_bcra,
)

pytestmark = pytest.mark.asyncio

FNEG = date(2026, 6, 1)


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _posicion(client, token) -> Decimal:
    r = await client.get("/api/v1/cajas/posicion-consolidada", headers=_h(token))
    assert r.status_code == 200, r.text
    return Decimal(r.json()["total"])


async def _crear_vendedor(client, token) -> str:
    r = await client.post(
        "/api/v1/usuarios",
        json={"email": "vend.e2e@nexo.test", "nombre": "Vendedor E2E",
              "password": "secreto123", "roles": ["vendedor"]},
        headers=_h(token),
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def test_ciclo_completo_con_conservacion_de_dinero(
    client, admin_token, session
):
    tok = admin_token

    # Ampliamos vigencia BCRA para que la aprobacion no dependa del reloj.
    await client.patch(
        "/api/v1/parametros", json={"bcra_vigencia_dias": 36500}, headers=_h(tok)
    )

    # --- Persona + BCRA ---
    persona = await crear_persona(client, tok)
    producto = await crear_producto(client, tok)
    perfil = await crear_perfil(client, tok)
    await cargar_tasa(client, tok, producto, perfil, 6, tasa="0.30")
    # Matriz de comision (2%): el desembolso devenga la comision del vendedor.
    r = await client.put(
        "/api/v1/matrices/comisiones",
        json={"celdas": [{"producto_id": producto, "perfil_id": perfil,
                          "comision": "0.02"}]},
        headers=_h(tok),
    )
    assert r.status_code == 200, r.text
    await sync_bcra(client, tok, persona)

    # --- Caja + aporte de capital (define la posicion base) ---
    r = await client.post(
        "/api/v1/cajas", json={"nombre": "Caja E2E", "tipo": "efectivo"},
        headers=_h(tok),
    )
    assert r.status_code == 201, r.text
    caja = r.json()["id"]

    vendedor = await _crear_vendedor(client, tok)

    r = await client.post(
        "/api/v1/tesoreria/aportes",
        json={"monto": "1000000.00", "fecha_negocio": FNEG.isoformat(),
              "caja_id": caja, "inversor": "Socio"},
        headers={**_h(tok), "Idempotency-Key": "e2e-aporte"},
    )
    assert r.status_code == 201, r.text
    pos_tras_aporte = await _posicion(client, tok)
    assert pos_tras_aporte == Decimal("1000000.00")

    # --- Solicitud -> evaluar -> aprobar ---
    r = await client.post(
        "/api/v1/solicitudes",
        json={"persona_id": persona, "producto_id": producto, "monto": "100000.00",
              "cantidad_cuotas": 6, "vendedor_id": vendedor},
        headers=_h(tok),
    )
    assert r.status_code == 201, r.text
    sid = r.json()["id"]
    assert r.json()["estado"] == "borrador"

    r = await client.post(f"/api/v1/solicitudes/{sid}/evaluar", headers=_h(tok))
    assert r.status_code == 200, r.text
    assert r.json()["estado"] == "en_analisis"

    r = await client.patch(
        f"/api/v1/solicitudes/{sid}/estado", json={"estado": "aprobada"},
        headers=_h(tok),
    )
    assert r.status_code == 200, r.text
    assert r.json()["estado"] == "aprobada"

    # --- Desembolsar (loan + snapshot + cuotas + caja egreso) ---
    # Desembolso 40 dias antes de FNEG con primera cuota ya vencida a FNEG, de modo
    # que el prestamo tenga saldo exigible (genera parada de ruta a FNEG).
    fneg_des = FNEG - timedelta(days=40)
    fpc = FNEG - timedelta(days=10)
    r = await client.post(
        f"/api/v1/solicitudes/{sid}/desembolsar",
        json={"caja_id": caja, "fecha_negocio": fneg_des.isoformat(),
              "fecha_primera_cuota": fpc.isoformat(),
              "tasa_punitorio_diario": "0.001"},
        headers={**_h(tok), "Idempotency-Key": "e2e-des"},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["estado"] == "desembolsada"
    assert body["cantidad_cuotas"] == 6
    prestamo_id = body["prestamo_id"]

    # Conservacion: el desembolso egresa el capital (100000) de la caja.
    pos_tras_desembolso = await _posicion(client, tok)
    assert pos_tras_desembolso == pos_tras_aporte - Decimal("100000.00")

    # --- Pago de mostrador (ingresa a caja, reconcilia waterfall) ---
    r = await client.post(
        "/api/v1/pagos",
        json={"prestamo_id": prestamo_id, "monto": "20000.00", "canal": "mostrador",
              "caja_id": caja, "fecha_negocio": FNEG.isoformat()},
        headers={**_h(tok), "Idempotency-Key": "e2e-pago"},
    )
    assert r.status_code == 201, r.text
    pago_id = r.json()["id"]
    assert r.json()["monto"] == "20000.00"

    # El detalle expone las imputaciones del waterfall; suma + excedente == monto.
    r_det = await client.get(f"/api/v1/pagos/{pago_id}", headers=_h(tok))
    assert r_det.status_code == 200, r_det.text
    det = r_det.json()
    suma_imp = sum(Decimal(i["monto"]) for i in det["imputaciones"])
    assert suma_imp + Decimal(det["excedente"]) == Decimal("20000.00")

    pos_tras_pago = await _posicion(client, tok)
    assert pos_tras_pago == pos_tras_desembolso + Decimal("20000.00")

    # --- Ruta -> visita (cobro) -> sync idempotente -> rendicion ---
    r = await client.post(
        "/api/v1/rutas",
        json={"cobrador_id": vendedor, "fecha": FNEG.isoformat()},
        headers=_h(tok),
    )
    # cobrador_id debe ser un cobrador; usamos un usuario cobrador dedicado.
    if r.status_code != 201:
        # crear cobrador y reintentar
        rc = await client.post(
            "/api/v1/usuarios",
            json={"email": "cob.e2e@nexo.test", "nombre": "Cob E2E",
                  "password": "secreto123", "roles": ["cobrador"]},
            headers=_h(tok),
        )
        assert rc.status_code == 201, rc.text
        cobrador = rc.json()["id"]
        r = await client.post(
            "/api/v1/rutas",
            json={"cobrador_id": cobrador, "fecha": FNEG.isoformat()},
            headers=_h(tok),
        )
    assert r.status_code == 201, r.text
    ruta_id = r.json()["id"]

    r = await client.get(f"/api/v1/rutas/{ruta_id}/paradas", headers=_h(tok))
    assert r.status_code == 200, r.text
    paradas = r.json()
    assert len(paradas) >= 1  # el prestamo con saldo exigible

    pos_pre_ruta = await _posicion(client, tok)
    # El sync usa paradas con id/pago_id generados en el dispositivo (UUIDv7-like).
    import uuid as _uuid

    parada_dev_id = str(_uuid.uuid4())
    pago_dev_id = str(_uuid.uuid4())
    batch = {
        "paradas": [{
            "id": parada_dev_id,
            "prestamo_id": prestamo_id,
            "orden": 1,
            "resultado": "pago",
            "monto_cobrado": "15000.00",
            "pago_id": pago_dev_id,
        }],
        "caja_id": caja,
    }
    r = await client.post(
        f"/api/v1/rutas/{ruta_id}/sync", json=batch, headers=_h(tok)
    )
    assert r.status_code == 200, r.text
    assert r.json()["aplicadas"] == 1

    pos_tras_visita = await _posicion(client, tok)
    assert pos_tras_visita == pos_pre_ruta + Decimal("15000.00")

    # Sync idempotente: re-enviar el mismo batch NO duplica el cobro.
    r2 = await client.post(
        f"/api/v1/rutas/{ruta_id}/sync", json=batch, headers=_h(tok)
    )
    assert r2.status_code == 200, r2.text
    assert r2.json()["omitidas"] == 1
    assert r2.json()["aplicadas"] == 0
    pos_tras_resync = await _posicion(client, tok)
    assert pos_tras_resync == pos_tras_visita  # idempotente: sin doble cobro

    # Rendicion reconcilia el total cobrado de la ruta.
    r = await client.post(
        "/api/v1/rendiciones",
        json={"ruta_id": ruta_id, "fecha_negocio": FNEG.isoformat()},
        headers=_h(tok),
    )
    assert r.status_code == 201, r.text
    assert Decimal(r.json()["total_cobrado"]) == Decimal("15000.00")

    # --- Comision: el desembolso devengo 2% sobre 100000 = 2000 ---
    r = await client.get(
        f"/api/v1/vendedores/{vendedor}/comisiones", headers=_h(tok)
    )
    assert r.status_code == 200, r.text
    devengos = r.json()
    assert len(devengos) >= 1
    total_devengado = sum(Decimal(d["monto"]) for d in devengos)
    assert total_devengado == Decimal("2000.00")

    # --- Liquidacion: generar -> aprobar -> pagar (egreso de caja) ---
    r = await client.post(
        "/api/v1/comisiones/liquidaciones",
        json={"vendedor_id": vendedor,
              "periodo_desde": (FNEG - timedelta(days=90)).isoformat(),
              "periodo_hasta": (FNEG + timedelta(days=30)).isoformat()},
        headers=_h(tok),
    )
    assert r.status_code == 201, r.text
    liq = r.json()
    liq_id = liq["id"]
    assert Decimal(liq["monto_total"]) == Decimal("2000.00")

    r = await client.patch(
        f"/api/v1/comisiones/liquidaciones/{liq_id}/aprobar", headers=_h(tok)
    )
    assert r.status_code == 200, r.text
    assert r.json()["estado"] == "aprobada"

    pos_pre_liq = await _posicion(client, tok)
    r = await client.post(
        f"/api/v1/comisiones/liquidaciones/{liq_id}/pagar",
        json={"caja_id": caja, "fecha_negocio": FNEG.isoformat()},
        headers={**_h(tok), "Idempotency-Key": "e2e-liq"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["estado"] == "pagada"

    # Conservacion: la liquidacion egresa exactamente el monto_total.
    pos_tras_liq = await _posicion(client, tok)
    assert pos_tras_liq == pos_pre_liq - Decimal("2000.00")

    # --- Snapshot -> torre/pulso refleja la actividad ---
    # Posicion consolidada de caja JUSTO antes del snapshot: el snapshot debe
    # reportar exactamente este capital_disponible (no una metrica desacoplada).
    pos_pre_snapshot = await _posicion(client, tok)
    r = await client.post(
        "/api/v1/torre/snapshot", json={"fecha_corte": FNEG.isoformat()},
        headers=_h(tok),
    )
    assert r.status_code == 200, r.text
    snap = r.json()
    assert snap["prestamos_vigentes"] >= 1
    # Conservacion: el capital_disponible del snapshot == posicion consolidada.
    assert Decimal(snap["capital_disponible"]) == pos_pre_snapshot

    r = await client.get("/api/v1/torre/pulso", headers=_h(tok))
    assert r.status_code == 200, r.text
    pulso = r.json()
    assert pulso["tiene_snapshot"] is True
    tarjetas = {t["clave"]: t["valor"] for t in pulso["tarjetas"]}
    assert int(tarjetas["prestamos_vigentes"]) >= 1

    # --- Documento (hash/numero) ---
    r = await client.post(
        "/api/v1/documentos/generar",
        json={"tipo": "pagare", "prestamo_id": prestamo_id},
        headers={**_h(tok), "Idempotency-Key": "e2e-doc"},
    )
    assert r.status_code == 201, r.text
    doc = r.json()
    assert doc["hash_sha256"]
    assert doc["numero"] >= 1

    # --- Correccion del pago de mostrador (append-only) ---
    pos_pre_correccion = await _posicion(client, tok)
    r = await client.post(
        f"/api/v1/pagos/{pago_id}/corregir",
        json={"monto": "25000.00", "canal": "mostrador", "caja_id": caja,
              "fecha_negocio": FNEG.isoformat()},
        headers={**_h(tok), "Idempotency-Key": "e2e-corr"},
    )
    assert r.status_code == 201, r.text
    # La correccion ajusta el efectivo en caja por la diferencia (25000 - 20000).
    pos_tras_correccion = await _posicion(client, tok)
    assert pos_tras_correccion == pos_pre_correccion + Decimal("5000.00")

    # El pago original sigue existiendo (append-only): consultarlo no falla.
    r = await client.get(f"/api/v1/pagos/{pago_id}", headers=_h(tok))
    assert r.status_code == 200, r.text
