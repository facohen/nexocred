def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _producto_payload():
    return {
        "nombre": "Credito Personal",
        "descripcion": "Producto base",
        "periodicidad": "mensual",
        "plazos_permitidos": [3, 6, 12],
        "monto_minimo": "10000.00",
        "monto_maximo": "500000.00",
        "gastos": [
            {"nombre": "Sellado", "tipo": "porcentaje", "valor": "0.0150",
             "financiado": False},
            {"nombre": "Otorgamiento", "tipo": "fijo", "valor": "500.0000",
             "financiado": True},
        ],
    }


async def test_alta_producto_inicia_borrador(client, admin_token):
    r = await client.post(
        "/api/v1/productos", json=_producto_payload(), headers=_h(admin_token)
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["estado"] == "borrador"
    assert body["nombre"] == "Credito Personal"
    assert body["monto_minimo"] == "10000.00"
    assert len(body["gastos"]) == 2


async def test_no_admin_no_puede_crear_producto_403(client, analista_token):
    r = await client.post(
        "/api/v1/productos", json=_producto_payload(), headers=_h(analista_token)
    )
    assert r.status_code == 403


async def test_listar_productos(client, admin_token):
    await client.post("/api/v1/productos", json=_producto_payload(), headers=_h(admin_token))
    r = await client.get("/api/v1/productos", headers=_h(admin_token))
    assert r.status_code == 200
    assert any(p["nombre"] == "Credito Personal" for p in r.json())


async def test_detalle_producto_con_gastos(client, admin_token):
    r = await client.post(
        "/api/v1/productos", json=_producto_payload(), headers=_h(admin_token)
    )
    pid = r.json()["id"]
    r = await client.get(f"/api/v1/productos/{pid}", headers=_h(admin_token))
    assert r.status_code == 200
    body = r.json()
    assert len(body["gastos"]) == 2
    assert body["gastos"][0]["valor"] in ("0.0150", "500.0000")


async def test_patch_genera_nueva_version(client, admin_token):
    r = await client.post(
        "/api/v1/productos", json=_producto_payload(), headers=_h(admin_token)
    )
    pid = r.json()["id"]
    assert r.json()["version_vigente"] == 1
    r = await client.patch(
        f"/api/v1/productos/{pid}",
        json={"descripcion": "actualizado", "monto_maximo": "600000.00"},
        headers=_h(admin_token),
    )
    assert r.status_code == 200
    assert r.json()["version_vigente"] == 2


async def test_publicar_producto(client, admin_token):
    r = await client.post(
        "/api/v1/productos", json=_producto_payload(), headers=_h(admin_token)
    )
    pid = r.json()["id"]
    r = await client.post(f"/api/v1/productos/{pid}/publicar", headers=_h(admin_token))
    assert r.status_code == 200
    assert r.json()["estado"] == "activo"


async def test_alta_producto_audita(client, admin_token):
    await client.post("/api/v1/productos", json=_producto_payload(), headers=_h(admin_token))
    r = await client.get("/api/v1/auditoria?accion=producto_alta", headers=_h(admin_token))
    assert any(e["accion"] == "producto_alta" for e in r.json())
