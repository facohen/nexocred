def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def test_analista_no_puede_crear_usuario_403(client, analista_token):
    r = await client.post(
        "/api/v1/usuarios",
        json={"email": "x@nexo.test", "nombre": "X", "password": "secreto123", "roles": []},
        headers=_h(analista_token),
    )
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "prohibido"


async def test_admin_puede_crear_usuario_201(client, admin_token):
    r = await client.post(
        "/api/v1/usuarios",
        json={
            "email": "nuevo@nexo.test", "nombre": "Nuevo",
            "password": "secreto123", "roles": ["cobrador"],
        },
        headers=_h(admin_token),
    )
    assert r.status_code == 201
    body = r.json()
    assert body["email"] == "nuevo@nexo.test"
    assert body["roles"] == ["cobrador"]


async def test_token_invalido_401(client):
    r = await client.get("/api/v1/usuarios", headers=_h("basura"))
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "no_autenticado"


async def test_analista_no_puede_listar_usuarios_403(client, analista_token):
    r = await client.get("/api/v1/usuarios", headers=_h(analista_token))
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "prohibido"


async def test_admin_puede_listar_usuarios_200(client, admin_token):
    r = await client.get("/api/v1/usuarios", headers=_h(admin_token))
    assert r.status_code == 200
