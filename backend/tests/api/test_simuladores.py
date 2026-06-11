from datetime import date

from nexocred_core import Periodicidad, TerminosPrestamo, calcular_cronograma


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def test_simulador_otorgante_usa_core(client, admin_token):
    payload = {
        "capital": "10000.00",
        "tasa_interes_directo": "0.10",
        "cantidad_cuotas": 5,
        "periodicidad": "mensual",
        "fecha_primera_cuota": "2026-01-10",
    }
    r = await client.post(
        "/api/v1/simulador/otorgante", json=payload, headers=_h(admin_token)
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total_a_pagar"] == "11000.00"
    assert all(isinstance(f["cuota"], str) for f in body["cuotas"])
    assert body["cuotas"][0]["cuota"] == "2200.00"
    assert len(body["cuotas"]) == 5


async def test_simulador_reconcilia_con_core(client, admin_token):
    payload = {
        "capital": "10000.00",
        "tasa_interes_directo": "0.10",
        "cantidad_cuotas": 5,
        "periodicidad": "mensual",
        "fecha_primera_cuota": "2026-01-10",
    }
    r = await client.post(
        "/api/v1/simulador/otorgante", json=payload, headers=_h(admin_token)
    )
    body = r.json()
    crono = calcular_cronograma(
        TerminosPrestamo(
            capital=__import__("decimal").Decimal("10000.00"),
            tasa_interes_directo=__import__("decimal").Decimal("0.10"),
            cantidad_cuotas=5,
            periodicidad=Periodicidad.MENSUAL,
            fecha_primera_cuota=date(2026, 1, 10),
        )
    )
    assert body["total_a_pagar"] == f"{crono.total_a_pagar:.2f}"
    for fila_api, fila_core in zip(body["cuotas"], crono.filas, strict=True):
        assert fila_api["cuota"] == f"{fila_core.cuota:.2f}"
        assert fila_api["capital"] == f"{fila_core.capital:.2f}"
        assert fila_api["interes"] == f"{fila_core.interes:.2f}"


async def test_simulador_cotizador_misma_matematica(client, admin_token):
    payload = {
        "capital": "20000.00",
        "tasa_interes_directo": "0.20",
        "cantidad_cuotas": 4,
        "periodicidad": "quincenal",
        "fecha_primera_cuota": "2026-02-01",
    }
    r = await client.post(
        "/api/v1/simulador/cotizador", json=payload, headers=_h(admin_token)
    )
    assert r.status_code == 200
    assert r.json()["total_interes"] == "4000.00"


async def test_simulador_rechaza_float_en_dinero(client, admin_token):
    payload = {
        "capital": 10000.5,
        "tasa_interes_directo": "0.10",
        "cantidad_cuotas": 5,
        "periodicidad": "mensual",
        "fecha_primera_cuota": "2026-01-10",
    }
    r = await client.post(
        "/api/v1/simulador/otorgante", json=payload, headers=_h(admin_token)
    )
    assert r.status_code == 422


async def test_simulador_interno_resuelve_perfil(client, admin_token):
    # crear producto + perfil + matriz
    rp = await client.post(
        "/api/v1/productos",
        json={"nombre": "Prod Sim", "plazos_permitidos": [5]},
        headers=_h(admin_token),
    )
    prod = rp.json()["id"]
    rf = await client.post(
        "/api/v1/perfiles-pricing", json={"nombre": "Std", "orden": 0},
        headers=_h(admin_token),
    )
    perfil = rf.json()["id"]
    await client.put(
        "/api/v1/matrices/tasas",
        json={"celdas": [
            {"producto_id": prod, "perfil_id": perfil, "plazo": 5, "tasa": "0.1000"}
        ]},
        headers=_h(admin_token),
    )
    r = await client.post(
        "/api/v1/simulador/interno",
        json={
            "capital": "10000.00",
            "producto_id": prod,
            "perfil_id": perfil,
            "cantidad_cuotas": 5,
            "periodicidad": "mensual",
            "fecha_primera_cuota": "2026-01-10",
        },
        headers=_h(admin_token),
    )
    assert r.status_code == 200, r.text
    assert r.json()["total_a_pagar"] == "11000.00"


async def test_simulador_interno_sin_tasa_422(client, admin_token):
    rp = await client.post(
        "/api/v1/productos",
        json={"nombre": "Prod NoTasa", "plazos_permitidos": [5]},
        headers=_h(admin_token),
    )
    prod = rp.json()["id"]
    rf = await client.post(
        "/api/v1/perfiles-pricing", json={"nombre": "Sin", "orden": 0},
        headers=_h(admin_token),
    )
    perfil = rf.json()["id"]
    r = await client.post(
        "/api/v1/simulador/interno",
        json={
            "capital": "10000.00",
            "producto_id": prod,
            "perfil_id": perfil,
            "cantidad_cuotas": 5,
            "periodicidad": "mensual",
            "fecha_primera_cuota": "2026-01-10",
        },
        headers=_h(admin_token),
    )
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "tasa_no_definida"
