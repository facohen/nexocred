from tests.api.test_solicitudes import crear_persona


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _crear_operador(client, admin_token, email="op1@nexo.test"):
    r = await client.post(
        "/api/v1/usuarios",
        json={"email": email, "nombre": "Operador", "password": "secreto123",
              "roles": ["administrativo"]},
        headers=_h(admin_token),
    )
    assert r.status_code == 201, r.text
    uid = r.json()["id"]
    login = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": "secreto123"}
    )
    return uid, login.json()["access_token"]


async def test_crear_y_completar_tarea_genera_interaccion(client, admin_token):
    persona = await crear_persona(client, admin_token)
    r = await client.post(
        "/api/v1/tareas",
        json={"persona_id": persona, "titulo": "Llamar al cliente"},
        headers=_h(admin_token),
    )
    assert r.status_code == 201, r.text
    tarea_id = r.json()["id"]
    assert r.json()["estado"] == "pendiente"
    assert r.json()["origen"] == "manual"

    comp = await client.post(
        f"/api/v1/tareas/{tarea_id}/completar",
        json={"tipo": "llamada", "detalle": "atendio, paga el viernes"},
        headers=_h(admin_token),
    )
    assert comp.status_code == 200, comp.text
    assert comp.json()["tarea_id"] == tarea_id
    assert comp.json()["tipo"] == "llamada"

    det = await client.get(f"/api/v1/tareas/{tarea_id}", headers=_h(admin_token))
    assert det.json()["estado"] == "completada"


async def test_inbox_administrativo_ve_todas(client, admin_token):
    # Modelo 5-roles: "administrativo" es back-office/supervisión y VE TODO.
    # Ya no hay aislamiento por-usuario en el inbox de tareas: cualquier
    # administrativo ve todas las tareas, propias o ajenas.
    persona = await crear_persona(client, admin_token)
    op1_id, op1_token = await _crear_operador(client, admin_token, "op_a@nexo.test")
    op2_id, op2_token = await _crear_operador(client, admin_token, "op_b@nexo.test")

    # tarea asignada a op1
    await client.post(
        "/api/v1/tareas",
        json={"persona_id": persona, "titulo": "T1", "operador_id": op1_id},
        headers=_h(admin_token),
    )
    # tarea asignada a op2
    await client.post(
        "/api/v1/tareas",
        json={"persona_id": persona, "titulo": "T2", "operador_id": op2_id},
        headers=_h(admin_token),
    )

    # op1 (administrativo) ve TODAS las tareas, incluida la ajena (T2)
    inbox1 = await client.get("/api/v1/tareas", headers=_h(op1_token))
    titulos1 = {t["titulo"] for t in inbox1.json()["data"]}
    assert titulos1 == {"T1", "T2"}

    # admin tambien ve todas
    todas = await client.get("/api/v1/tareas", headers=_h(admin_token))
    assert len({t["titulo"] for t in todas.json()["data"]}) == 2


async def test_crear_interaccion_directa(client, admin_token):
    persona = await crear_persona(client, admin_token)
    r = await client.post(
        "/api/v1/interacciones",
        json={"persona_id": persona, "tipo": "nota", "detalle": "primera nota"},
        headers=_h(admin_token),
    )
    assert r.status_code == 201, r.text
    assert r.json()["tipo"] == "nota"


async def test_tareas_de_persona(client, admin_token):
    persona = await crear_persona(client, admin_token)
    await client.post(
        "/api/v1/tareas",
        json={"persona_id": persona, "titulo": "TP"},
        headers=_h(admin_token),
    )
    r = await client.get(
        f"/api/v1/personas/{persona}/tareas", headers=_h(admin_token)
    )
    assert r.status_code == 200
    assert len(r.json()) == 1


async def test_incidente_crud(client, admin_token):
    persona = await crear_persona(client, admin_token)
    r = await client.post(
        "/api/v1/incidentes",
        json={"persona_id": persona, "tipo": "reclamo", "titulo": "Cobro duplicado",
              "severidad": "alta"},
        headers=_h(admin_token),
    )
    assert r.status_code == 201, r.text
    iid = r.json()["id"]
    assert r.json()["estado"] == "abierto"

    pa = await client.patch(
        f"/api/v1/incidentes/{iid}", json={"estado": "resuelto"},
        headers=_h(admin_token),
    )
    assert pa.status_code == 200
    assert pa.json()["estado"] == "resuelto"

    lst = await client.get("/api/v1/incidentes?estado=resuelto", headers=_h(admin_token))
    assert any(i["id"] == iid for i in lst.json()["data"])


async def test_asignacion_individual_y_masiva(client, admin_token):
    p1 = await crear_persona(client, admin_token, cuil="20111111112", dni="11111111")
    p2 = await crear_persona(client, admin_token, cuil="20222222223", dni="22222222")
    op_id, _ = await _crear_operador(client, admin_token, "op_asig@nexo.test")

    r = await client.post(
        "/api/v1/crm/asignaciones",
        json={"persona_id": p1, "operador_id": op_id},
        headers=_h(admin_token),
    )
    assert r.status_code == 201, r.text
    assert r.json()["activo"] is True

    m = await client.post(
        "/api/v1/crm/asignaciones/masivo",
        json={"persona_ids": [p1, p2], "operador_id": op_id},
        headers=_h(admin_token),
    )
    assert m.status_code == 200, m.text
    assert len(m.json()) == 2


async def test_timeline_agrega_crm_y_credito(client, admin_token, session):
    from datetime import date

    from sqlalchemy import text

    from tests.integration._helpers_f1c import relajar_bcra
    from tests.integration.test_pagos_waterfall import _prestamo_desembolsado

    await relajar_bcra(client, admin_token)
    prestamo, caja = await _prestamo_desembolsado(
        client, admin_token, session, fpc_offset=-30,
        cuil="20444444445", dni="44444444",
    )
    # persona del prestamo
    res = await session.execute(
        text("SELECT persona_id FROM prestamo WHERE id=:p"), {"p": prestamo}
    )
    persona = str(res.scalar_one())

    # un pago de mostrador
    await client.post(
        "/api/v1/pagos",
        json={"prestamo_id": prestamo, "monto": "3000.00", "canal": "mostrador",
              "caja_id": caja, "fecha_negocio": date.today().isoformat()},
        headers={**_h(admin_token), "Idempotency-Key": "pago-tl"},
    )
    # una interaccion CRM
    await client.post(
        "/api/v1/interacciones",
        json={"persona_id": persona, "tipo": "llamada", "detalle": "recordatorio"},
        headers=_h(admin_token),
    )

    tl = await client.get(
        f"/api/v1/personas/{persona}/timeline", headers=_h(admin_token)
    )
    assert tl.status_code == 200, tl.text
    tipos = [e["tipo"] for e in tl.json()]
    assert any(t.startswith("interaccion") for t in tipos)
    assert "pago" in tipos
    assert "desembolso" in tipos
    # orden temporal ascendente
    fechas = [e["fecha"] for e in tl.json()]
    assert fechas == sorted(fechas)


async def test_timeline_incluye_novacion(client, admin_token, session):
    import uuid as _uuid

    from sqlalchemy import text

    from tests.integration._helpers_f1c import cuil_valido, relajar_bcra
    from tests.integration.test_pagos_waterfall import _prestamo_desembolsado

    await relajar_bcra(client, admin_token)
    prestamo, _caja = await _prestamo_desembolsado(
        client, admin_token, session, fpc_offset=-30,
        cuil=cuil_valido("45555555"), dni="45555555",
    )
    res = await session.execute(
        text("SELECT persona_id FROM prestamo WHERE id=:p"), {"p": prestamo}
    )
    persona = str(res.scalar_one())

    # insertar una novacion que origina el prestamo de la persona
    nov_id = str(_uuid.uuid4())
    await session.execute(
        text(
            "INSERT INTO novacion (id, tipo, estado, created_at) "
            "VALUES (:i, 'refinanciacion', 'confirmada', now())"
        ),
        {"i": nov_id},
    )
    await session.execute(
        text(
            "INSERT INTO novacion_origen (id, novacion_id, prestamo_id) "
            "VALUES (:i, :n, :p)"
        ),
        {"i": str(_uuid.uuid4()), "n": nov_id, "p": prestamo},
    )
    await session.commit()

    tl = await client.get(
        f"/api/v1/personas/{persona}/timeline", headers=_h(admin_token)
    )
    assert tl.status_code == 200, tl.text
    eventos = tl.json()
    tipos = [e["tipo"] for e in eventos]
    assert "novacion" in tipos
    # los eventos de credito previos siguen presentes
    assert "desembolso" in tipos
    # ordenado por fecha ascendente
    fechas = [e["fecha"] for e in eventos]
    assert fechas == sorted(fechas)
    # la referencia de la novacion apunta al id correcto
    nov_evt = next(e for e in eventos if e["tipo"] == "novacion")
    assert nov_evt["referencia"] == nov_id


async def test_interaccion_enriquecida_con_maestros(client, admin_token):
    """Interaccion con tema_id, canal_id, disposicion_id y credito_id → 201 OK."""
    from tests.integration._helpers_f1c import cuil_valido

    # Crear maestros necesarios
    tema_r = await client.post(
        "/api/v1/maestros/temas",
        json={"codigo": "pago_cuota", "nombre": "Pago de cuota"},
        headers=_h(admin_token),
    )
    assert tema_r.status_code == 201, tema_r.text
    tema_id = tema_r.json()["id"]

    canal_r = await client.post(
        "/api/v1/maestros/canales",
        json={"codigo": "whatsapp", "nombre": "WhatsApp"},
        headers=_h(admin_token),
    )
    assert canal_r.status_code == 201, canal_r.text
    canal_id = canal_r.json()["id"]

    disp_r = await client.post(
        "/api/v1/maestros/disposiciones",
        json={"codigo": "contactado_ok", "nombre": "Contactado OK", "genera_cobro": False},
        headers=_h(admin_token),
    )
    assert disp_r.status_code == 201, disp_r.text
    disposicion_id = disp_r.json()["id"]

    persona = await crear_persona(
        client, admin_token, cuil=cuil_valido("50000001"), dni="50000001"
    )
    r = await client.post(
        "/api/v1/interacciones",
        json={
            "persona_id": persona,
            "tipo": "llamada",
            "detalle": "contacto exitoso",
            "tema_id": tema_id,
            "canal_id": canal_id,
            "disposicion_id": disposicion_id,
        },
        headers=_h(admin_token),
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["tema_id"] == tema_id
    assert body["canal_id"] == canal_id
    assert body["disposicion_id"] == disposicion_id


async def test_interaccion_con_proximo_paso_crea_tarea(client, admin_token, session):
    """proximo_paso_fecha presente → tarea de seguimiento_crm creada en la misma transaccion."""
    from datetime import date, timedelta

    from sqlalchemy import text
    from tests.integration._helpers_f1c import cuil_valido

    persona = await crear_persona(
        client, admin_token, cuil=cuil_valido("50000002"), dni="50000002"
    )
    fecha_seguimiento = (date.today() + timedelta(days=7)).isoformat()

    r = await client.post(
        "/api/v1/interacciones",
        json={
            "persona_id": persona,
            "tipo": "nota",
            "detalle": "prometio pagar el viernes",
            "proximo_paso_fecha": fecha_seguimiento,
            "proximo_paso_nota": "Confirmar pago",
        },
        headers=_h(admin_token),
    )
    assert r.status_code == 201, r.text

    # Verificar que se creo la tarea de seguimiento
    res = await session.execute(
        text(
            "SELECT count(*) FROM tarea "
            "WHERE origen='seguimiento_crm' AND persona_id=:p"
        ),
        {"p": persona},
    )
    count = res.scalar_one()
    assert count == 1, f"Esperaba 1 tarea de seguimiento, encontre {count}"

    # La interaccion tiene los campos de proximo paso
    assert r.json()["proximo_paso_fecha"] == fecha_seguimiento
    assert r.json()["proximo_paso_nota"] == "Confirmar pago"


async def test_timeline_filtrado_por_tema(client, admin_token):
    """Timeline con ?tema_id= solo devuelve interacciones de ese tema."""
    from tests.integration._helpers_f1c import cuil_valido

    persona = await crear_persona(
        client, admin_token, cuil=cuil_valido("50000003"), dni="50000003"
    )

    # Crear dos temas
    tema1_r = await client.post(
        "/api/v1/maestros/temas",
        json={"codigo": "pago_t1", "nombre": "Pago T1"},
        headers=_h(admin_token),
    )
    assert tema1_r.status_code == 201, tema1_r.text
    tema1_id = tema1_r.json()["id"]

    tema2_r = await client.post(
        "/api/v1/maestros/temas",
        json={"codigo": "reclamo_t2", "nombre": "Reclamo T2"},
        headers=_h(admin_token),
    )
    assert tema2_r.status_code == 201, tema2_r.text
    tema2_id = tema2_r.json()["id"]

    # Interaccion con tema1
    r1 = await client.post(
        "/api/v1/interacciones",
        json={"persona_id": persona, "tipo": "llamada", "detalle": "llamada t1",
              "tema_id": tema1_id},
        headers=_h(admin_token),
    )
    assert r1.status_code == 201, r1.text

    # Interaccion con tema2
    r2 = await client.post(
        "/api/v1/interacciones",
        json={"persona_id": persona, "tipo": "nota", "detalle": "nota t2",
              "tema_id": tema2_id},
        headers=_h(admin_token),
    )
    assert r2.status_code == 201, r2.text

    # Timeline sin filtro → 2 interacciones (al menos)
    tl_all = await client.get(
        f"/api/v1/personas/{persona}/timeline", headers=_h(admin_token)
    )
    assert tl_all.status_code == 200, tl_all.text
    tipos_all = [e["tipo"] for e in tl_all.json()]
    # Debe haber al menos 2 eventos de interaccion
    interacciones_all = [t for t in tipos_all if t.startswith("interaccion")]
    assert len(interacciones_all) >= 2

    # Timeline filtrado por tema1 → solo la interaccion de tema1
    tl_fil = await client.get(
        f"/api/v1/personas/{persona}/timeline?tema_id={tema1_id}",
        headers=_h(admin_token),
    )
    assert tl_fil.status_code == 200, tl_fil.text
    eventos_fil = tl_fil.json()
    interacciones_fil = [e for e in eventos_fil if e["tipo"].startswith("interaccion")]
    assert len(interacciones_fil) == 1
    assert interacciones_fil[0]["detalle"] == "llamada t1"


async def test_interaccion_genera_auditoria(client, admin_token, session):
    from sqlalchemy import text

    from tests.api.test_solicitudes import crear_persona
    from tests.integration._helpers_f1c import cuil_valido

    persona = await crear_persona(
        client, admin_token, cuil=cuil_valido("46666666"), dni="46666666"
    )
    r = await client.post(
        "/api/v1/interacciones",
        json={"persona_id": persona, "tipo": "llamada", "detalle": "seguimiento"},
        headers=_h(admin_token),
    )
    assert r.status_code in (200, 201), r.text
    iid = r.json()["id"]
    res = await session.execute(
        text("SELECT count(*) FROM auditoria_evento WHERE accion='interaccion_alta' "
             "AND entidad='interaccion' AND entidad_id=:i"),
        {"i": iid},
    )
    assert res.scalar_one() == 1
