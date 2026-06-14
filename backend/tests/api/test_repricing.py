def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _crear_producto(client, token) -> str:
    r = await client.post(
        "/api/v1/productos",
        json={"nombre": "Prod Repricing", "plazos_permitidos": [3, 6, 12]},
        headers=_h(token),
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _crear_perfil(client, token, nombre="RP") -> str:
    r = await client.post(
        "/api/v1/perfiles-pricing",
        json={"nombre": nombre, "orden": 1},
        headers=_h(token),
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _seed_matriz(client, token):
    prod = await _crear_producto(client, token)
    perfil = await _crear_perfil(client, token)
    celdas = [
        {"producto_id": prod, "perfil_id": perfil, "plazo": 3, "tasa": "0.1000"},
        {"producto_id": prod, "perfil_id": perfil, "plazo": 6, "tasa": "0.2000"},
    ]
    r = await client.put(
        "/api/v1/matrices/tasas", json={"celdas": celdas}, headers=_h(token)
    )
    assert r.status_code == 200, r.text
    return prod, perfil


async def test_repricing_preview_no_muta(client, admin_token):
    prod, perfil = await _seed_matriz(client, admin_token)
    ajustes = [
        {"producto_id": prod, "perfil_id": perfil, "plazo": 3, "tasa": "0.1500"},
    ]
    r = await client.post(
        "/api/v1/productos/repricing", json={"ajustes": ajustes}, headers=_h(admin_token)
    )
    assert r.status_code == 200, r.text
    body = r.json()
    cambios = body["cambios"]
    assert len(cambios) == 1
    c = cambios[0]
    assert c["producto_id"] == prod
    assert c["perfil_id"] == perfil
    assert c["plazo"] == 3
    assert c["tasa_anterior"] == "0.1000"
    assert c["tasa_nueva"] == "0.1500"
    assert isinstance(c["tasa_anterior"], str)
    assert isinstance(c["tasa_nueva"], str)
    # No muto la matriz real.
    r = await client.get("/api/v1/matrices/tasas", headers=_h(admin_token))
    actual = {x["plazo"]: x["tasa"] for x in r.json()["data"]}
    assert actual[3] == "0.1000"


async def test_repricing_confirmar_aplica_y_genera_vigencias(client, admin_token):
    prod, perfil = await _seed_matriz(client, admin_token)
    r = await client.get(f"/api/v1/productos/{prod}", headers=_h(admin_token))
    version_previa = r.json()["version_vigente"]

    ajustes = [
        {"producto_id": prod, "perfil_id": perfil, "plazo": 3, "tasa": "0.1500"},
    ]
    r = await client.post(
        "/api/v1/productos/repricing/confirmar",
        json={"ajustes": ajustes},
        headers=_h(admin_token),
    )
    assert r.status_code == 200, r.text
    # Matriz aplicada.
    r = await client.get("/api/v1/matrices/tasas", headers=_h(admin_token))
    actual = {x["plazo"]: x["tasa"] for x in r.json()["data"]}
    assert actual[3] == "0.1500"
    # Genero nueva vigencia (bump de version del producto).
    r = await client.get(f"/api/v1/productos/{prod}", headers=_h(admin_token))
    assert r.json()["version_vigente"] > version_previa


async def test_repricing_confirmar_audita(client, admin_token):
    prod, perfil = await _seed_matriz(client, admin_token)
    ajustes = [
        {"producto_id": prod, "perfil_id": perfil, "plazo": 6, "tasa": "0.2500"},
    ]
    await client.post(
        "/api/v1/productos/repricing/confirmar",
        json={"ajustes": ajustes},
        headers=_h(admin_token),
    )
    r = await client.get(
        "/api/v1/auditoria?accion=repricing_confirmacion", headers=_h(admin_token)
    )
    assert any(e["accion"] == "repricing_confirmacion" for e in r.json()["data"])


async def test_repricing_confirmar_solo_admin(client, analista_token):
    r = await client.post(
        "/api/v1/productos/repricing/confirmar",
        json={"ajustes": [
            {"producto_id": "00000000-0000-0000-0000-000000000000",
             "perfil_id": "00000000-0000-0000-0000-000000000000",
             "plazo": 3, "tasa": "0.10"}
        ]},
        headers=_h(analista_token),
    )
    assert r.status_code == 403
