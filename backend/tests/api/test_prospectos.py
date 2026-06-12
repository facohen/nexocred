from tests.api.test_solicitudes import crear_persona


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def test_pipeline_prospecto_y_conversion(client, admin_token):
    r = await client.post(
        "/api/v1/prospectos",
        json={"nombre": "Lead Uno", "telefono": "1133224455"},
        headers=_h(admin_token),
    )
    assert r.status_code == 201, r.text
    pid = r.json()["id"]
    assert r.json()["estado"] == "nuevo"

    # avanzar estado
    av = await client.patch(
        f"/api/v1/prospectos/{pid}", json={"estado": "contactado"},
        headers=_h(admin_token),
    )
    assert av.status_code == 200
    assert av.json()["estado"] == "contactado"

    # convertir sin persona -> 422
    bad = await client.patch(
        f"/api/v1/prospectos/{pid}", json={"estado": "convertido"},
        headers=_h(admin_token),
    )
    assert bad.status_code == 422, bad.text

    # convertir con persona existente
    persona = await crear_persona(client, admin_token)
    ok = await client.patch(
        f"/api/v1/prospectos/{pid}",
        json={"estado": "convertido", "persona_id": persona},
        headers=_h(admin_token),
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["estado"] == "convertido"
    assert ok.json()["persona_id"] == persona


async def test_listar_prospectos_por_estado(client, admin_token):
    await client.post(
        "/api/v1/prospectos", json={"nombre": "A"}, headers=_h(admin_token)
    )
    r = await client.get("/api/v1/prospectos?estado=nuevo", headers=_h(admin_token))
    assert r.status_code == 200
    assert all(p["estado"] == "nuevo" for p in r.json())
