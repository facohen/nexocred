def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _persona_payload(cuil="20123456786", dni="12345678"):
    return {
        "apellido": "Perez",
        "nombre": "Juan",
        "dni": dni,
        "cuil": cuil,
        "fecha_nac": "1990-05-12",
        "estado_civil": "soltero",
        "email": "juan@perez.com",
        "telefono": "1122334455",
        "domicilio_calle": "Av Siempre Viva",
        "domicilio_numero": "742",
        "domicilio_localidad": "Springfield",
        "domicilio_provincia": "Buenos Aires",
        "tipo_vivienda": "propia",
        "ingresos_declarados": "150000.00",
        "ingresos_en_blanco": "100000.00",
        "ingresos_totales": "150000.00",
        "referencias": [
            {
                "nombre": "Maria",
                "apellido": "Gomez",
                "telefono": "1199887766",
                "vinculo": "madre",
            }
        ],
    }


async def test_alta_persona_201(client, admin_token):
    r = await client.post(
        "/api/v1/personas", json=_persona_payload(), headers=_h(admin_token)
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["cuil"] == "20123456786"
    assert body["ingresos_totales"] == "150000.00"
    assert len(body["referencias"]) == 1


async def test_alta_persona_sin_referencias_422(client, admin_token):
    payload = _persona_payload()
    payload["referencias"] = []
    r = await client.post("/api/v1/personas", json=payload, headers=_h(admin_token))
    assert r.status_code == 422


async def test_alta_persona_sin_ingresos_totales_422(client, admin_token):
    payload = _persona_payload()
    del payload["ingresos_totales"]
    r = await client.post("/api/v1/personas", json=payload, headers=_h(admin_token))
    assert r.status_code == 422


async def test_alta_persona_cuil_invalido_422(client, admin_token):
    payload = _persona_payload(cuil="20123456780")
    r = await client.post("/api/v1/personas", json=payload, headers=_h(admin_token))
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "cuil_invalido"


async def test_alta_persona_cuil_duplicado_409(client, admin_token):
    r = await client.post(
        "/api/v1/personas", json=_persona_payload(), headers=_h(admin_token)
    )
    assert r.status_code == 201
    r = await client.post(
        "/api/v1/personas",
        json=_persona_payload(dni="99999999"),
        headers=_h(admin_token),
    )
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "cuil_duplicado"


async def test_alta_persona_audita(client, admin_token):
    await client.post("/api/v1/personas", json=_persona_payload(), headers=_h(admin_token))
    r = await client.get("/api/v1/auditoria?accion=persona_alta", headers=_h(admin_token))
    assert any(e["accion"] == "persona_alta" for e in r.json())


async def test_lista_y_filtro_por_cuil(client, admin_token):
    await client.post("/api/v1/personas", json=_persona_payload(), headers=_h(admin_token))
    r = await client.get("/api/v1/personas?cuil=20123456786", headers=_h(admin_token))
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 1
    assert body["data"][0]["cuil"] == "20123456786"


async def test_buscar_autocomplete(client, admin_token):
    await client.post("/api/v1/personas", json=_persona_payload(), headers=_h(admin_token))
    r = await client.get("/api/v1/personas/buscar?q=Perez", headers=_h(admin_token))
    assert r.status_code == 200
    assert any(p["apellido"] == "Perez" for p in r.json())


async def test_ficha_por_id(client, admin_token):
    r = await client.post(
        "/api/v1/personas", json=_persona_payload(), headers=_h(admin_token)
    )
    pid = r.json()["id"]
    r = await client.get(f"/api/v1/personas/{pid}", headers=_h(admin_token))
    assert r.status_code == 200
    assert r.json()["id"] == pid


async def test_patch_no_cambia_cuil_ni_dni(client, admin_token):
    r = await client.post(
        "/api/v1/personas", json=_persona_payload(), headers=_h(admin_token)
    )
    pid = r.json()["id"]
    r = await client.patch(
        f"/api/v1/personas/{pid}",
        json={"telefono": "0000", "cuil": "27111111117", "dni": "00000000"},
        headers=_h(admin_token),
    )
    assert r.status_code == 200
    assert r.json()["telefono"] == "0000"
    assert r.json()["cuil"] == "20123456786"
    assert r.json()["dni"] == "12345678"


async def test_patch_audita(client, admin_token):
    r = await client.post(
        "/api/v1/personas", json=_persona_payload(), headers=_h(admin_token)
    )
    pid = r.json()["id"]
    await client.patch(
        f"/api/v1/personas/{pid}", json={"telefono": "0000"}, headers=_h(admin_token)
    )
    r = await client.get(
        "/api/v1/auditoria?accion=persona_modificacion", headers=_h(admin_token)
    )
    assert any(e["entidad_id"] == pid for e in r.json())
