def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def test_crud_usuario_completo(client, admin_token):
    # alta
    r = await client.post(
        "/api/v1/usuarios",
        json={
            "email": "user1@nexo.test", "nombre": "User Uno",
            "password": "secreto123", "roles": ["cobrador"],
        },
        headers=_h(admin_token),
    )
    assert r.status_code == 201
    uid = r.json()["id"]

    # lista
    r = await client.get("/api/v1/usuarios", headers=_h(admin_token))
    assert r.status_code == 200
    emails = {u["email"] for u in r.json()}
    assert "user1@nexo.test" in emails

    # patch cambia roles
    r = await client.patch(
        f"/api/v1/usuarios/{uid}",
        json={"roles": ["vendedor", "operador"]},
        headers=_h(admin_token),
    )
    assert r.status_code == 200
    assert set(r.json()["roles"]) == {"vendedor", "operador"}

    # desactivar
    r = await client.delete(f"/api/v1/usuarios/{uid}", headers=_h(admin_token))
    assert r.status_code == 200

    r = await client.get("/api/v1/usuarios", headers=_h(admin_token))
    target = next(u for u in r.json() if u["id"] == uid)
    assert target["activo"] is False


async def test_email_duplicado_409(client, admin_token):
    payload = {
        "email": "dup@nexo.test", "nombre": "Dup",
        "password": "secreto123", "roles": [],
    }
    r = await client.post("/api/v1/usuarios", json=payload, headers=_h(admin_token))
    assert r.status_code == 201
    r = await client.post("/api/v1/usuarios", json=payload, headers=_h(admin_token))
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "email_duplicado"


async def test_rol_inexistente_400(client, admin_token):
    r = await client.post(
        "/api/v1/usuarios",
        json={
            "email": "badrole@nexo.test", "nombre": "Bad",
            "password": "secreto123", "roles": ["superpoder"],
        },
        headers=_h(admin_token),
    )
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "rol_inexistente"
