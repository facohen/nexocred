def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _persona_payload(cuil="20123456786", dni="12345678"):
    return {
        "apellido": "Perez", "nombre": "Juan", "dni": dni, "cuil": cuil,
        "fecha_nac": "1990-05-12", "estado_civil": "soltero",
        "email": "juan@perez.com", "telefono": "111", "domicilio_calle": "C1",
        "domicilio_localidad": "Loc", "domicilio_provincia": "BA",
        "tipo_vivienda": "propia", "ingresos_declarados": "100000.00",
        "ingresos_en_blanco": "0.00", "ingresos_totales": "100000.00",
        "referencias": [{"nombre": "Ref", "telefono": "222", "vinculo": "madre"}],
    }


async def _crear_persona(client, token) -> str:
    r = await client.post("/api/v1/personas", json=_persona_payload(), headers=_h(token))
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def test_sync_persiste_deuda_y_audita(client, admin_token):
    pid = await _crear_persona(client, admin_token)
    r = await client.post(
        f"/api/v1/personas/{pid}/deuda-bcra/sync", headers=_h(admin_token)
    )
    assert r.status_code == 200, r.text
    filas = r.json()
    assert len(filas) >= 1
    fila = filas[0]
    assert isinstance(fila["monto"], str)
    assert "." in fila["monto"]
    assert 1 <= fila["situacion"] <= 6
    assert fila["fecha_informe"]

    # historial via GET /personas/{id}/deuda-bcra
    r = await client.get(f"/api/v1/personas/{pid}/deuda-bcra", headers=_h(admin_token))
    assert r.status_code == 200
    assert len(r.json()) >= 1

    # audita
    r = await client.get("/api/v1/auditoria?accion=bcra_sync", headers=_h(admin_token))
    assert any(e["entidad_id"] == pid for e in r.json()["data"])


async def test_endpoint_bcra_consultar_alternativo(client, admin_token):
    pid = await _crear_persona(client, admin_token)
    r = await client.post(f"/api/v1/bcra/consultar/{pid}", headers=_h(admin_token))
    assert r.status_code == 200
    r = await client.get(f"/api/v1/bcra/{pid}/historial", headers=_h(admin_token))
    assert r.status_code == 200
    assert len(r.json()) >= 1


async def test_sync_persona_inexistente_404(client, admin_token):
    import uuid

    r = await client.post(
        f"/api/v1/personas/{uuid.uuid4()}/deuda-bcra/sync", headers=_h(admin_token)
    )
    assert r.status_code == 404


async def test_fecha_informe_vigente_persistida(client, admin_token, session):
    from sqlalchemy import text

    pid = await _crear_persona(client, admin_token)
    await client.post(f"/api/v1/personas/{pid}/deuda-bcra/sync", headers=_h(admin_token))
    res = await session.execute(
        text(
            "SELECT max(fecha_informe) FROM persona_deuda_bcra WHERE persona_id=:pid"
        ),
        {"pid": pid},
    )
    assert res.scalar() is not None


def test_fake_bcra_determinista():
    import asyncio

    from app.bcra.fake import FakeBcraClient

    c = FakeBcraClient()
    a = asyncio.run(c.consultar("20123456786"))
    b = asyncio.run(c.consultar("20123456786"))
    assert [d.entidad for d in a] == [d.entidad for d in b]
    assert [str(d.monto) for d in a] == [str(d.monto) for d in b]
