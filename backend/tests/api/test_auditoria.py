def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def test_alta_usuario_genera_auditoria(client, admin_token):
    await client.post(
        "/api/v1/usuarios",
        json={
            "email": "audit@nexo.test", "nombre": "Audit",
            "password": "secreto123", "roles": ["analista"],
        },
        headers=_h(admin_token),
    )
    r = await client.get("/api/v1/auditoria?accion=usuario_alta", headers=_h(admin_token))
    assert r.status_code == 200
    eventos = r.json()["data"]
    assert any(e["accion"] == "usuario_alta" for e in eventos)
    assert all(e["resultado"] == "ok" for e in eventos)


async def test_cambio_roles_genera_auditoria(client, admin_token):
    r = await client.post(
        "/api/v1/usuarios",
        json={
            "email": "roles@nexo.test", "nombre": "Roles",
            "password": "secreto123", "roles": ["analista"],
        },
        headers=_h(admin_token),
    )
    uid = r.json()["id"]
    await client.patch(
        f"/api/v1/usuarios/{uid}", json={"roles": ["admin"]}, headers=_h(admin_token)
    )
    r = await client.get(
        "/api/v1/auditoria?accion=usuario_cambio_roles", headers=_h(admin_token)
    )
    assert any(e["entidad_id"] == uid for e in r.json()["data"])


async def test_auditoria_solo_admin(client, analista_token):
    r = await client.get("/api/v1/auditoria", headers=_h(analista_token))
    assert r.status_code == 403


async def test_refresh_exitoso_genera_auditoria(client, usuario_seed):
    r = await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@nexo.test", "password": "secreto123"},
    )
    refresh_token = r.json()["refresh_token"]
    r = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert r.status_code == 200
    access = r.json()["access_token"]
    r = await client.get("/api/v1/auditoria?accion=refresh", headers=_h(access))
    assert r.status_code == 200
    eventos = r.json()["data"]
    assert any(e["accion"] == "refresh" and e["resultado"] == "ok" for e in eventos)


async def test_parametros_patch_audita(client, admin_token):
    r = await client.patch(
        "/api/v1/parametros", json={"bcra_vigencia_dias": 45}, headers=_h(admin_token)
    )
    assert r.status_code == 200
    assert r.json()["bcra_vigencia_dias"] == 45
    r = await client.get(
        "/api/v1/auditoria?accion=parametros_modificacion", headers=_h(admin_token)
    )
    assert any(e["accion"] == "parametros_modificacion" for e in r.json()["data"])
