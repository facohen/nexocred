def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _persona_payload():
    return {
        "apellido": "Lopez", "nombre": "Ana", "dni": "30111222",
        "cuil": "27111111117", "fecha_nac": "1985-03-03", "estado_civil": "casado",
        "email": "ana@lopez.com", "telefono": "111", "domicilio_calle": "Calle 1",
        "domicilio_localidad": "Loc", "domicilio_provincia": "BA",
        "tipo_vivienda": "alquilada", "ingresos_declarados": "200000.00",
        "ingresos_en_blanco": "0.00", "ingresos_totales": "200000.00",
        "referencias": [
            {"nombre": "Pedro", "telefono": "222", "vinculo": "hermano"}
        ],
    }


async def _crear_persona(client, token) -> str:
    r = await client.post("/api/v1/personas", json=_persona_payload(), headers=_h(token))
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def test_agregar_y_listar_referencia(client, admin_token):
    pid = await _crear_persona(client, admin_token)
    r = await client.post(
        f"/api/v1/personas/{pid}/referencias",
        json={"nombre": "Vecino", "telefono": "333", "vinculo": "vecino"},
        headers=_h(admin_token),
    )
    assert r.status_code == 201
    r = await client.get(f"/api/v1/personas/{pid}/referencias", headers=_h(admin_token))
    assert r.status_code == 200
    vinculos = {x["vinculo"] for x in r.json()}
    assert {"hermano", "vecino"} <= vinculos


async def test_eliminar_referencia(client, admin_token):
    pid = await _crear_persona(client, admin_token)
    r = await client.post(
        f"/api/v1/personas/{pid}/referencias",
        json={"nombre": "Temp", "telefono": "444", "vinculo": "amigo"},
        headers=_h(admin_token),
    )
    ref_id = r.json()["id"]
    r = await client.delete(
        f"/api/v1/personas/{pid}/referencias/{ref_id}", headers=_h(admin_token)
    )
    assert r.status_code == 200
    r = await client.get(f"/api/v1/personas/{pid}/referencias", headers=_h(admin_token))
    assert ref_id not in {x["id"] for x in r.json()}


async def test_eliminar_ultima_referencia_409(client, admin_token):
    # La persona se crea con exactamente 1 referencia (ver _persona_payload).
    pid = await _crear_persona(client, admin_token)
    r = await client.get(f"/api/v1/personas/{pid}/referencias", headers=_h(admin_token))
    assert len(r.json()) == 1
    ref_id = r.json()[0]["id"]
    r = await client.delete(
        f"/api/v1/personas/{pid}/referencias/{ref_id}", headers=_h(admin_token)
    )
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "referencia_minima"
    # No se elimino.
    r = await client.get(f"/api/v1/personas/{pid}/referencias", headers=_h(admin_token))
    assert len(r.json()) == 1


async def test_eliminar_referencia_cuando_hay_mas_de_una_ok(client, admin_token):
    pid = await _crear_persona(client, admin_token)
    r = await client.post(
        f"/api/v1/personas/{pid}/referencias",
        json={"nombre": "Extra", "telefono": "555", "vinculo": "amigo"},
        headers=_h(admin_token),
    )
    ref_id = r.json()["id"]
    r = await client.delete(
        f"/api/v1/personas/{pid}/referencias/{ref_id}", headers=_h(admin_token)
    )
    assert r.status_code in (200, 204)
    r = await client.get(f"/api/v1/personas/{pid}/referencias", headers=_h(admin_token))
    assert len(r.json()) == 1


async def test_eliminar_referencia_inexistente_404(client, admin_token):
    pid = await _crear_persona(client, admin_token)
    import uuid

    r = await client.delete(
        f"/api/v1/personas/{pid}/referencias/{uuid.uuid4()}", headers=_h(admin_token)
    )
    assert r.status_code == 404


async def test_agregar_marcas_operativa_y_lista_negra(client, admin_token):
    pid = await _crear_persona(client, admin_token)
    r = await client.post(
        f"/api/v1/personas/{pid}/marcas",
        json={"tipo": "operativa", "motivo": "cliente preferente"},
        headers=_h(admin_token),
    )
    assert r.status_code == 201
    r = await client.post(
        f"/api/v1/personas/{pid}/marcas",
        json={"tipo": "lista_negra", "motivo": "mora reiterada"},
        headers=_h(admin_token),
    )
    assert r.status_code == 201
    r = await client.get(f"/api/v1/personas/{pid}/marcas", headers=_h(admin_token))
    tipos = {m["tipo"] for m in r.json()}
    assert {"operativa", "lista_negra"} <= tipos
