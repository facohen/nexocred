from sqlalchemy import text


async def _tablas(session):
    res = await session.execute(text(
        "SELECT table_name FROM information_schema.tables WHERE table_schema='public'"
    ))
    return {r[0] for r in res}


async def _cols(session, t):
    res = await session.execute(text(
        "SELECT column_name FROM information_schema.columns WHERE table_name=:t"), {"t": t})
    return {r[0] for r in res}


async def test_tablas_f1c_existen(session):
    tablas = await _tablas(session)
    for t in ["rendicion", "rendicion_descargo", "comision_liquidacion",
              "comision_liquidacion_detalle", "interaccion", "asignacion_crm", "prospecto"]:
        assert t in tablas, t


async def test_parada_ruta_tiene_sync_fields(session):
    cols = await _cols(session, "parada_ruta")
    assert "ruta_id" in cols and "resultado" in cols  # already from F1a


async def test_comision_devengo_tiene_clawback(session):
    cols = await _cols(session, "comision_devengo")
    for c in ["tipo", "porcentaje", "clawback_de_id"]:
        assert c in cols


async def test_alerta_tiene_severidad_y_asignacion(session):
    cols = await _cols(session, "alerta")
    for c in ["severidad", "operador_id", "tarea_id", "metrica"]:
        assert c in cols


async def test_tarea_tiene_deltas(session):
    cols = await _cols(session, "tarea")
    for c in ["origen", "alerta_id", "vencimiento", "prioridad"]:
        assert c in cols


async def test_rendicion_tiene_campos(session):
    cols = await _cols(session, "rendicion")
    for c in ["ruta_id", "cobrador_id", "fecha_negocio", "total_cobrado",
              "total_descargos", "diferencia", "estado"]:
        assert c in cols


async def test_comision_liquidacion_tiene_egreso(session):
    cols = await _cols(session, "comision_liquidacion")
    for c in ["vendedor_id", "periodo_desde", "periodo_hasta", "monto_total",
              "estado", "egreso_id"]:
        assert c in cols
