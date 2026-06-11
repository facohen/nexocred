def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _crear_producto(client, token) -> str:
    r = await client.post(
        "/api/v1/productos",
        json={"nombre": "Prod Matriz", "plazos_permitidos": [3, 6, 12]},
        headers=_h(token),
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _crear_perfil(client, token, nombre="A") -> str:
    r = await client.post(
        "/api/v1/perfiles-pricing",
        json={"nombre": nombre, "orden": 1},
        headers=_h(token),
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def test_crear_perfil(client, admin_token):
    r = await client.post(
        "/api/v1/perfiles-pricing",
        json={"nombre": "Premium", "descripcion": "tasa baja", "orden": 0},
        headers=_h(admin_token),
    )
    assert r.status_code == 201
    assert r.json()["nombre"] == "Premium"
    r = await client.get("/api/v1/perfiles-pricing", headers=_h(admin_token))
    assert any(p["nombre"] == "Premium" for p in r.json())


async def test_perfil_duplicado_409(client, admin_token):
    payload = {"nombre": "Unico", "orden": 0}
    await client.post("/api/v1/perfiles-pricing", json=payload, headers=_h(admin_token))
    r = await client.post(
        "/api/v1/perfiles-pricing", json=payload, headers=_h(admin_token)
    )
    assert r.status_code == 409


async def test_put_matriz_tasas_bulk_y_get(client, admin_token):
    prod = await _crear_producto(client, admin_token)
    perfil = await _crear_perfil(client, admin_token, "A")
    celdas = [
        {"producto_id": prod, "perfil_id": perfil, "plazo": 3, "tasa": "0.1500"},
        {"producto_id": prod, "perfil_id": perfil, "plazo": 6, "tasa": "0.3000"},
    ]
    r = await client.put(
        "/api/v1/matrices/tasas", json={"celdas": celdas}, headers=_h(admin_token)
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert all(isinstance(c["tasa"], str) for c in body)
    tasas = {c["plazo"]: c["tasa"] for c in body}
    assert tasas[3] == "0.1500"
    assert tasas[6] == "0.3000"

    r = await client.get("/api/v1/matrices/tasas", headers=_h(admin_token))
    assert len(r.json()) == 2


async def test_put_matriz_tasas_upsert(client, admin_token):
    prod = await _crear_producto(client, admin_token)
    perfil = await _crear_perfil(client, admin_token, "A")
    celda = {"producto_id": prod, "perfil_id": perfil, "plazo": 3, "tasa": "0.1000"}
    await client.put(
        "/api/v1/matrices/tasas", json={"celdas": [celda]}, headers=_h(admin_token)
    )
    celda["tasa"] = "0.2000"
    r = await client.put(
        "/api/v1/matrices/tasas", json={"celdas": [celda]}, headers=_h(admin_token)
    )
    body = r.json()
    assert len([c for c in body if c["plazo"] == 3]) == 1
    assert next(c for c in body if c["plazo"] == 3)["tasa"] == "0.2000"


async def test_put_matriz_comisiones(client, admin_token):
    prod = await _crear_producto(client, admin_token)
    perfil = await _crear_perfil(client, admin_token, "A")
    r = await client.put(
        "/api/v1/matrices/comisiones",
        json={"celdas": [
            {"producto_id": prod, "perfil_id": perfil, "comision": "0.0500"}
        ]},
        headers=_h(admin_token),
    )
    assert r.status_code == 200
    assert r.json()[0]["comision"] == "0.0500"
    r = await client.get("/api/v1/matrices/comisiones", headers=_h(admin_token))
    assert len(r.json()) == 1


async def test_matriz_requiere_admin(client, analista_token):
    r = await client.put(
        "/api/v1/matrices/tasas",
        json={"celdas": [
            {"producto_id": "00000000-0000-0000-0000-000000000000",
             "perfil_id": "00000000-0000-0000-0000-000000000000",
             "plazo": 3, "tasa": "0.10"}
        ]},
        headers=_h(analista_token),
    )
    assert r.status_code == 403
