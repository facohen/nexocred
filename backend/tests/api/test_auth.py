async def test_login_ok_devuelve_tokens(client, usuario_seed):
    r = await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@nexo.test", "password": "secreto123"},
    )
    assert r.status_code == 200
    body = r.json()
    assert "access_token" in body and "refresh_token" in body
    assert body["token_type"] == "bearer"


async def test_login_password_invalida_401(client, usuario_seed):
    r = await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@nexo.test", "password": "malo"},
    )
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "credenciales_invalidas"


async def test_login_password_invalida_audita(client, usuario_seed, session):
    from sqlalchemy import text

    await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@nexo.test", "password": "malo"},
    )
    res = await session.execute(
        text(
            "SELECT count(*) FROM auditoria_evento "
            "WHERE accion='login' AND resultado='fallido'"
        )
    )
    assert res.scalar() >= 1


async def test_ruta_protegida_sin_token_401(client):
    r = await client.get("/api/v1/usuarios")
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "no_autenticado"


async def test_refresh_emite_nuevo_access(client, usuario_seed):
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@nexo.test", "password": "secreto123"},
    )
    refresh = login.json()["refresh_token"]
    r = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh})
    assert r.status_code == 200
    assert "access_token" in r.json()


async def test_refresh_con_access_token_rechazado(client, usuario_seed):
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@nexo.test", "password": "secreto123"},
    )
    access = login.json()["access_token"]
    r = await client.post("/api/v1/auth/refresh", json={"refresh_token": access})
    assert r.status_code == 401
