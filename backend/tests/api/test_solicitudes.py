from datetime import date, timedelta


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _persona_payload(cuil="20123456786", dni="12345678", fecha_nac="1990-05-12"):
    return {
        "apellido": "Perez",
        "nombre": "Juan",
        "dni": dni,
        "cuil": cuil,
        "fecha_nac": fecha_nac,
        "estado_civil": "soltero",
        "email": "juan@perez.com",
        "telefono": "1122334455",
        "domicilio_calle": "Av Siempre Viva",
        "domicilio_numero": "742",
        "domicilio_localidad": "Springfield",
        "domicilio_provincia": "Buenos Aires",
        "tipo_vivienda": "propia",
        "ingresos_declarados": "300000.00",
        "ingresos_en_blanco": "200000.00",
        "ingresos_totales": "300000.00",
        "referencias": [
            {
                "nombre": "Maria",
                "apellido": "Gomez",
                "telefono": "1199887766",
                "vinculo": "madre",
            }
        ],
    }


async def crear_persona(client, token, **kw) -> str:
    r = await client.post(
        "/api/v1/personas", json=_persona_payload(**kw), headers=_h(token)
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def crear_producto(client, token, plazos=(3, 6, 12)) -> str:
    r = await client.post(
        "/api/v1/productos",
        json={"nombre": "Prestamo Personal", "plazos_permitidos": list(plazos)},
        headers=_h(token),
    )
    assert r.status_code == 201, r.text
    pid = r.json()["id"]
    await client.post(f"/api/v1/productos/{pid}/publicar", headers=_h(token))
    return pid


async def crear_perfil(client, token, nombre="Estandar") -> str:
    r = await client.post(
        "/api/v1/perfiles-pricing",
        json={"nombre": nombre, "orden": 1},
        headers=_h(token),
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def cargar_tasa(client, token, producto_id, perfil_id, plazo, tasa="0.30") -> None:
    r = await client.put(
        "/api/v1/matrices/tasas",
        json={
            "celdas": [
                {
                    "producto_id": producto_id,
                    "perfil_id": perfil_id,
                    "plazo": plazo,
                    "tasa": tasa,
                }
            ]
        },
        headers=_h(token),
    )
    assert r.status_code == 200, r.text


async def sync_bcra(client, token, persona_id) -> None:
    r = await client.post(
        f"/api/v1/personas/{persona_id}/deuda-bcra/sync", headers=_h(token)
    )
    assert r.status_code == 200, r.text


async def crear_solicitud(client, token, persona_id, producto_id, monto="100000.00",
                          cantidad_cuotas=6) -> str:
    r = await client.post(
        "/api/v1/solicitudes",
        json={
            "persona_id": persona_id,
            "producto_id": producto_id,
            "monto": monto,
            "cantidad_cuotas": cantidad_cuotas,
        },
        headers=_h(token),
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


# ---------------- Task 3 tests ----------------
async def test_crear_solicitud_201_borrador(client, admin_token):
    persona = await crear_persona(client, admin_token)
    producto = await crear_producto(client, admin_token)
    r = await client.post(
        "/api/v1/solicitudes",
        json={"persona_id": persona, "producto_id": producto, "monto": "100000.00",
              "cantidad_cuotas": 6},
        headers=_h(admin_token),
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["estado"] == "borrador"
    assert body["monto"] == "100000.00"


async def test_transicion_invalida_409(client, admin_token):
    persona = await crear_persona(client, admin_token)
    producto = await crear_producto(client, admin_token)
    sid = await crear_solicitud(client, admin_token, persona, producto)
    # borrador -> aprobada es invalido (debe pasar por en_analisis)
    r = await client.patch(
        f"/api/v1/solicitudes/{sid}/estado",
        json={"estado": "aprobada"},
        headers=_h(admin_token),
    )
    assert r.status_code == 409, r.text
    assert r.json()["error"]["code"] == "transicion_invalida"


async def test_validar_politicas_checklist(client, admin_token):
    persona = await crear_persona(client, admin_token)
    producto = await crear_producto(client, admin_token)
    sid = await crear_solicitud(client, admin_token, persona, producto)
    r = await client.get(
        f"/api/v1/solicitudes/{sid}/validar-politicas", headers=_h(admin_token)
    )
    assert r.status_code == 200, r.text
    checklist = r.json()
    for k in ("edad", "cuota_ingreso", "bcra", "mora_previa"):
        assert k in checklist
        assert isinstance(checklist[k], bool)


async def test_aprobar_bloqueado_sin_bcra(client, admin_token):
    persona = await crear_persona(client, admin_token)
    producto = await crear_producto(client, admin_token)
    perfil = await crear_perfil(client, admin_token)
    await cargar_tasa(client, admin_token, producto, perfil, 6)
    sid = await crear_solicitud(client, admin_token, persona, producto)
    # en_analisis ok
    r = await client.patch(
        f"/api/v1/solicitudes/{sid}/estado",
        json={"estado": "en_analisis"},
        headers=_h(admin_token),
    )
    assert r.status_code == 200, r.text
    # aprobar sin BCRA -> 409 bcra_vencido
    r = await client.patch(
        f"/api/v1/solicitudes/{sid}/estado",
        json={"estado": "aprobada"},
        headers=_h(admin_token),
    )
    assert r.status_code == 409, r.text
    assert r.json()["error"]["code"] == "bcra_vencido"


async def test_aprobar_ok_con_bcra(client, admin_token):
    persona = await crear_persona(client, admin_token)
    producto = await crear_producto(client, admin_token)
    sid = await crear_solicitud(client, admin_token, persona, producto)
    await sync_bcra(client, admin_token, persona)
    await client.patch(
        f"/api/v1/solicitudes/{sid}/estado",
        json={"estado": "en_analisis"},
        headers=_h(admin_token),
    )
    r = await client.patch(
        f"/api/v1/solicitudes/{sid}/estado",
        json={"estado": "aprobada"},
        headers=_h(admin_token),
    )
    assert r.status_code == 200, r.text
    assert r.json()["estado"] == "aprobada"


async def test_rechazar_desde_en_analisis(client, admin_token):
    persona = await crear_persona(client, admin_token)
    producto = await crear_producto(client, admin_token)
    sid = await crear_solicitud(client, admin_token, persona, producto)
    await client.patch(
        f"/api/v1/solicitudes/{sid}/estado",
        json={"estado": "en_analisis"},
        headers=_h(admin_token),
    )
    r = await client.patch(
        f"/api/v1/solicitudes/{sid}/estado",
        json={"estado": "rechazada", "motivo_rechazo": "score bajo"},
        headers=_h(admin_token),
    )
    assert r.status_code == 200, r.text
    assert r.json()["estado"] == "rechazada"


# ---------------- Task 4 tests ----------------
async def test_evaluar_asigna_score_perfil_tasa(client, admin_token):
    persona = await crear_persona(client, admin_token)
    producto = await crear_producto(client, admin_token)
    perfil = await crear_perfil(client, admin_token)
    await cargar_tasa(client, admin_token, producto, perfil, 6, tasa="0.30")
    await sync_bcra(client, admin_token, persona)
    sid = await crear_solicitud(client, admin_token, persona, producto, cantidad_cuotas=6)
    r = await client.post(
        f"/api/v1/solicitudes/{sid}/evaluar", headers=_h(admin_token)
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["estado"] == "en_analisis"
    assert isinstance(body["score"], int)
    assert body["perfil_pricing_id"] is not None
    assert body["tasa_resuelta"] == "0.3000"


async def test_simular_oferta(client, admin_token):
    persona = await crear_persona(client, admin_token)
    producto = await crear_producto(client, admin_token)
    perfil = await crear_perfil(client, admin_token)
    await cargar_tasa(client, admin_token, producto, perfil, 6, tasa="0.30")
    await sync_bcra(client, admin_token, persona)
    sid = await crear_solicitud(client, admin_token, persona, producto, cantidad_cuotas=6)
    await client.post(f"/api/v1/solicitudes/{sid}/evaluar", headers=_h(admin_token))
    r = await client.post(
        f"/api/v1/solicitudes/{sid}/simular",
        json={"fecha_primera_cuota": (date.today() + timedelta(days=30)).isoformat()},
        headers=_h(admin_token),
    )
    assert r.status_code == 200, r.text
    oferta = r.json()
    assert len(oferta["cuotas"]) == 6
    # dinero como string
    assert "." in oferta["total_a_pagar"]
    assert oferta["capital"] == "100000.00"
