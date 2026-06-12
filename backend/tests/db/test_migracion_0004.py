from sqlalchemy import text


async def _tablas(session):
    res = await session.execute(text(
        "SELECT table_name FROM information_schema.tables WHERE table_schema='public'"))
    return {r[0] for r in res}


async def _cols(session, t):
    res = await session.execute(text(
        "SELECT column_name FROM information_schema.columns WHERE table_name=:t"), {"t": t})
    return {r[0] for r in res}


async def _constraints(session, t):
    res = await session.execute(text(
        "SELECT conname FROM pg_constraint c "
        "JOIN pg_class r ON r.oid = c.conrelid WHERE r.relname=:t"), {"t": t})
    return {r[0] for r in res}


async def test_aporte_retiro_existe(session):
    assert "aporte_retiro" in await _tablas(session)


async def test_aporte_retiro_columnas(session):
    cols = await _cols(session, "aporte_retiro")
    for c in ["tipo", "monto", "fecha_negocio", "caja_id", "movimiento_id",
              "inversor", "nota", "created_by"]:
        assert c in cols, c


async def test_documento_numero_seq_existe(session):
    assert "documento_numero" in await _tablas(session)
    cols = await _cols(session, "documento_numero")
    assert {"tipo", "ultimo"} <= cols


async def test_workflow_regla_tiene_campos(session):
    cols = await _cols(session, "workflow_regla")
    for c in ["familia", "disparador", "accion", "accion_params", "activo", "orden"]:
        assert c in cols


async def test_workflow_ejecucion_dedupe(session):
    cols = await _cols(session, "workflow_ejecucion")
    assert "dedupe_key" in cols
    cons = await _constraints(session, "workflow_ejecucion")
    assert "workflow_ejecucion_regla_dedupe_uq" in cons


async def test_snapshot_tiene_columnas_torre(session):
    cols = await _cols(session, "snapshot_cartera")
    for c in ["punitorios_cobrados_mes", "capital_disponible"]:
        assert c in cols


async def test_snapshot_fecha_corte_unico(session):
    cons = await _constraints(session, "snapshot_cartera")
    assert "snapshot_cartera_fecha_corte_uq" in cons


async def test_documento_emitido_tipo_numero_unico(session):
    cons = await _constraints(session, "documento_emitido")
    assert "documento_emitido_tipo_numero_uq" in cons
