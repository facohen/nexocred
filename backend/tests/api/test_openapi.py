async def test_openapi_contiene_paths_implementados(client):
    r = await client.get("/openapi.json")
    assert r.status_code == 200
    paths = r.json()["paths"]
    for p in [
        "/api/v1/auth/login",
        "/api/v1/personas",
        "/api/v1/productos",
        "/api/v1/simulador/otorgante",
        "/api/v1/matrices/tasas",
        "/api/v1/bcra/consultar/{persona_id}",
    ]:
        assert p in paths, f"falta path {p}"
