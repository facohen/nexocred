from sqlalchemy import text


async def test_upgrade_crea_tablas_clave(session):
    res = await session.execute(
        text("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")
    )
    tablas = {r[0] for r in res}
    for t in [
        "persona", "usuario", "rol", "producto_credito",
        "auditoria_evento", "idempotency_key", "parada_ruta",
        "documento_emitido", "liquidacion_comision",
    ]:
        assert t in tablas


async def test_persona_cuil_es_unico(session):
    from sqlalchemy.exc import IntegrityError

    await session.execute(
        text(
            "INSERT INTO persona (apellido,nombre,dni,cuil,fecha_nac,estado_civil,email,"
            "telefono,domicilio_calle,domicilio_localidad,domicilio_provincia,tipo_vivienda,"
            "ingresos_declarados,ingresos_en_blanco,ingresos_totales) VALUES "
            "('A','B','111','20111111119','2000-01-01','soltero','a@b.c','123',"
            "'Calle','Loc','BA','propia',100,0,100)"
        )
    )
    await session.commit()
    try:
        await session.execute(
            text(
                "INSERT INTO persona (apellido,nombre,dni,cuil,fecha_nac,estado_civil,email,"
                "telefono,domicilio_calle,domicilio_localidad,domicilio_provincia,tipo_vivienda,"
                "ingresos_declarados,ingresos_en_blanco,ingresos_totales) VALUES "
                "('C','D','222','20111111119','2000-01-01','soltero','c@d.e','456',"
                "'Calle','Loc','BA','propia',100,0,100)"
            )
        )
        await session.commit()
        raised = False
    except IntegrityError:
        raised = True
    assert raised


async def test_situacion_bcra_check(session):
    from sqlalchemy.exc import IntegrityError

    await session.execute(
        text(
            "INSERT INTO persona (apellido,nombre,dni,cuil,fecha_nac,estado_civil,email,"
            "telefono,domicilio_calle,domicilio_localidad,domicilio_provincia,tipo_vivienda,"
            "ingresos_declarados,ingresos_en_blanco,ingresos_totales) VALUES "
            "('E','F','333','20222222229','2000-01-01','soltero','e@f.g','789',"
            "'Calle','Loc','BA','propia',100,0,100)"
        )
    )
    await session.commit()
    pid = (
        await session.execute(text("SELECT id FROM persona WHERE cuil='20222222229'"))
    ).scalar()
    try:
        await session.execute(
            text(
                "INSERT INTO persona_deuda_bcra (persona_id,entidad,monto,situacion,fecha_informe)"
                " VALUES (:pid,'Banco',100,9,'2026-01-01')"
            ),
            {"pid": pid},
        )
        await session.commit()
        raised = False
    except IntegrityError:
        raised = True
    assert raised


async def test_indices_brin_y_gin_existen(session):
    res = await session.execute(
        text("SELECT indexname FROM pg_indexes WHERE schemaname='public'")
    )
    indices = {r[0] for r in res}
    for idx in [
        "pago_created_at_brin", "imputacion_created_at_brin",
        "movimiento_caja_created_at_brin", "comision_devengo_created_at_brin",
        "persona_nombre_gin", "persona_cuil_idx",
    ]:
        assert idx in indices, f"falta indice {idx}"
