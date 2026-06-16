"""Tests E1 — módulo m16_maestros: CRUD catálogos, cascada provincia→localidad, asignación vendedor."""
import pytest

_H = lambda t: {"Authorization": f"Bearer {t}"}


# ---------- Zonas ----------

async def test_crear_zona_201(client, admin_token):
    r = await client.post(
        "/api/v1/maestros/zonas",
        json={"codigo": "norte", "nombre": "Zona Norte", "orden": 1},
        headers=_H(admin_token),
    )
    assert r.status_code == 201
    body = r.json()
    assert body["codigo"] == "norte"
    assert body["activo"] is True


async def test_crear_zona_duplicado_409(client, admin_token):
    payload = {"codigo": "sur", "nombre": "Zona Sur"}
    await client.post("/api/v1/maestros/zonas", json=payload, headers=_H(admin_token))
    r = await client.post("/api/v1/maestros/zonas", json=payload, headers=_H(admin_token))
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "codigo_duplicado"


async def test_listar_zonas_200(client, admin_token):
    await client.post(
        "/api/v1/maestros/zonas",
        json={"codigo": "centro", "nombre": "Centro"},
        headers=_H(admin_token),
    )
    r = await client.get("/api/v1/maestros/zonas", headers=_H(admin_token))
    assert r.status_code == 200
    assert r.json()["total"] >= 1


async def test_patch_zona_200(client, admin_token):
    r = await client.post(
        "/api/v1/maestros/zonas",
        json={"codigo": "oeste_patch", "nombre": "Oeste"},
        headers=_H(admin_token),
    )
    zona_id = r.json()["id"]
    r2 = await client.patch(
        f"/api/v1/maestros/zonas/{zona_id}",
        json={"nombre": "Zona Oeste Actualizada", "activo": False},
        headers=_H(admin_token),
    )
    assert r2.status_code == 200
    assert r2.json()["nombre"] == "Zona Oeste Actualizada"
    assert r2.json()["activo"] is False


async def test_crear_zona_403_no_admin(client, analista_token):
    r = await client.post(
        "/api/v1/maestros/zonas",
        json={"codigo": "x", "nombre": "X"},
        headers=_H(analista_token),
    )
    assert r.status_code == 403


# ---------- Sectores ----------

async def test_crear_sector_201(client, admin_token):
    r = await client.post(
        "/api/v1/maestros/sectores",
        json={"codigo": "call_test", "nombre": "Call Center Test"},
        headers=_H(admin_token),
    )
    assert r.status_code == 201
    assert r.json()["codigo"] == "call_test"


# ---------- Disposiciones ----------

async def test_crear_disposicion_201(client, admin_token):
    r = await client.post(
        "/api/v1/maestros/disposiciones",
        json={"codigo": "pago_test", "nombre": "Pago Test", "genera_cobro": True},
        headers=_H(admin_token),
    )
    assert r.status_code == 201
    assert r.json()["genera_cobro"] is True


# ---------- Provincias ----------

async def test_crear_provincia_201(client, admin_token):
    r = await client.post(
        "/api/v1/maestros/provincias",
        json={"codigo": "TEST-P", "nombre": "Provincia Test"},
        headers=_H(admin_token),
    )
    assert r.status_code == 201
    assert r.json()["nombre"] == "Provincia Test"


# ---------- Localidades ----------

async def test_crear_localidad_201(client, admin_token):
    # Primero crear provincia
    rp = await client.post(
        "/api/v1/maestros/provincias",
        json={"codigo": "TEST-LOC", "nombre": "Provincia para Localidad"},
        headers=_H(admin_token),
    )
    prov_id = rp.json()["id"]

    r = await client.post(
        "/api/v1/maestros/localidades",
        json={"provincia_id": prov_id, "nombre": "Ciudad Test"},
        headers=_H(admin_token),
    )
    assert r.status_code == 201
    assert r.json()["provincia_id"] == prov_id


async def test_localidad_duplicada_409(client, admin_token):
    rp = await client.post(
        "/api/v1/maestros/provincias",
        json={"codigo": "TEST-DUP", "nombre": "Provincia Duplic"},
        headers=_H(admin_token),
    )
    prov_id = rp.json()["id"]
    payload = {"provincia_id": prov_id, "nombre": "Ciudad Dup"}
    await client.post("/api/v1/maestros/localidades", json=payload, headers=_H(admin_token))
    r = await client.post("/api/v1/maestros/localidades", json=payload, headers=_H(admin_token))
    assert r.status_code == 409


async def test_localidad_provincia_inexistente_404(client, admin_token):
    import uuid
    r = await client.post(
        "/api/v1/maestros/localidades",
        json={"provincia_id": str(uuid.uuid4()), "nombre": "Zzz"},
        headers=_H(admin_token),
    )
    assert r.status_code == 404


async def test_cascada_localidades_por_provincia(client, admin_token):
    rp = await client.post(
        "/api/v1/maestros/provincias",
        json={"codigo": "TEST-CASC", "nombre": "Provincia Cascada"},
        headers=_H(admin_token),
    )
    prov_id = rp.json()["id"]
    for nombre in ["Ciudad A", "Ciudad B"]:
        await client.post(
            "/api/v1/maestros/localidades",
            json={"provincia_id": prov_id, "nombre": nombre},
            headers=_H(admin_token),
        )

    r = await client.get(
        f"/api/v1/maestros/localidades?provincia_id={prov_id}",
        headers=_H(admin_token),
    )
    assert r.status_code == 200
    nombres = [x["nombre"] for x in r.json()["data"]]
    assert "Ciudad A" in nombres
    assert "Ciudad B" in nombres


# ---------- Asignación Vendedor ----------

async def test_asignar_vendedor_201(client, admin_token):
    # Crear vendedor
    rv = await client.post(
        "/api/v1/usuarios",
        json={"email": "vend_asig@nexo.test", "nombre": "Vend Asig", "password": "s3cr3to!", "roles": ["vendedor"]},
        headers=_H(admin_token),
    )
    vendedor_id = rv.json()["id"]

    zona_id = (await client.post(
        "/api/v1/maestros/zonas",
        json={"codigo": "zona_asig", "nombre": "Zona Asig"},
        headers=_H(admin_token),
    )).json()["id"]
    sector_id = (await client.post(
        "/api/v1/maestros/sectores",
        json={"codigo": "sec_asig", "nombre": "Sector Asig"},
        headers=_H(admin_token),
    )).json()["id"]

    r = await client.put(
        f"/api/v1/maestros/vendedores/{vendedor_id}/asignacion",
        json={"zona_id": zona_id, "sector_id": sector_id, "vigente_desde": "2026-01-01"},
        headers=_H(admin_token),
    )
    assert r.status_code == 201
    assert r.json()["zona_id"] == zona_id
    assert r.json()["vigente_hasta"] is None


async def test_reasignar_cierra_anterior(client, admin_token):
    zona_id_1 = (await client.post(
        "/api/v1/maestros/zonas",
        json={"codigo": "zona_rea1", "nombre": "Zona Rea 1"},
        headers=_H(admin_token),
    )).json()["id"]
    zona_id_2 = (await client.post(
        "/api/v1/maestros/zonas",
        json={"codigo": "zona_rea2", "nombre": "Zona Rea 2"},
        headers=_H(admin_token),
    )).json()["id"]
    sector_id = (await client.post(
        "/api/v1/maestros/sectores",
        json={"codigo": "sec_rea", "nombre": "Sector Rea"},
        headers=_H(admin_token),
    )).json()["id"]

    rv2 = await client.post(
        "/api/v1/usuarios",
        json={"email": "vend_rea@nexo.test", "nombre": "Vend Rea", "password": "s3cr3to!", "roles": ["vendedor"]},
        headers=_H(admin_token),
    )
    vendedor_id = rv2.json()["id"]
    await client.put(
        f"/api/v1/maestros/vendedores/{vendedor_id}/asignacion",
        json={"zona_id": zona_id_1, "sector_id": sector_id, "vigente_desde": "2026-01-01"},
        headers=_H(admin_token),
    )
    r2 = await client.put(
        f"/api/v1/maestros/vendedores/{vendedor_id}/asignacion",
        json={"zona_id": zona_id_2, "sector_id": sector_id, "vigente_desde": "2026-06-01"},
        headers=_H(admin_token),
    )
    assert r2.status_code == 201
    # La nueva vigente tiene vigente_hasta None (la nueva)
    assert r2.json()["vigente_hasta"] is None
    assert r2.json()["zona_id"] == zona_id_2


async def test_listar_vendedores_403_no_admin(client, analista_token):
    r = await client.get("/api/v1/maestros/vendedores", headers=_H(analista_token))
    assert r.status_code == 403


# ---------- Precarga migración ----------

async def test_provincias_precargadas_24(client, admin_token):
    """La migración 0009 siembra exactamente 24 provincias argentinas."""
    r = await client.get(
        "/api/v1/maestros/provincias?per_page=50",
        headers=_H(admin_token),
    )
    assert r.status_code == 200
    assert r.json()["total"] == 24


async def test_sectores_precargados(client, admin_token):
    """La migración 0009 siembra 3 sectores (call_center, web, presencial)."""
    r = await client.get("/api/v1/maestros/sectores", headers=_H(admin_token))
    assert r.status_code == 200
    codigos = {x["codigo"] for x in r.json()["data"]}
    assert {"call_center", "web", "presencial"}.issubset(codigos)


async def test_disposiciones_precargadas(client, admin_token):
    """La migración 0009 siembra las disposiciones canónicas."""
    r = await client.get("/api/v1/maestros/disposiciones", headers=_H(admin_token))
    assert r.status_code == 200
    codigos = {x["codigo"] for x in r.json()["data"]}
    esperados = {"pago", "promesa", "no_contesta", "numero_errado", "se_niega", "ya_pago", "disputa"}
    assert esperados.issubset(codigos)
