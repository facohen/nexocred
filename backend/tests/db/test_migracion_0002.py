from sqlalchemy import text


async def _cols(session, tabla):
    res = await session.execute(
        text(
            "SELECT column_name FROM information_schema.columns WHERE table_name=:t"
        ),
        {"t": tabla},
    )
    return {r[0] for r in res}


async def _tablas(session):
    res = await session.execute(
        text(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema='public'"
        )
    )
    return {r[0] for r in res}


async def test_prestamo_tiene_snapshot_y_terminos(session):
    cols = await _cols(session, "prestamo")
    for c in [
        "snapshot_terminos",
        "fecha_desembolso",
        "tasa_punitorio_diario",
        "vendedor_id",
        "monto_desembolsado",
    ]:
        assert c in cols, c


async def test_pago_tiene_idempotency_y_canal(session):
    cols = await _cols(session, "pago")
    for c in ["idempotency_key", "canal", "corrige_pago_id", "excedente"]:
        assert c in cols, c


async def test_imputacion_tiene_orden_waterfall_y_cuota_numero(session):
    cols = await _cols(session, "imputacion")
    for c in ["orden_waterfall", "cuota_numero"]:
        assert c in cols, c


async def test_cuota_tiene_estado_y_saldos(session):
    cols = await _cols(session, "cuota")
    for c in ["punitorio_acumulado", "estado", "cuota"]:
        assert c in cols, c


async def test_solicitud_tiene_scoring(session):
    cols = await _cols(session, "solicitud_credito")
    for c in ["perfil_pricing_id", "tasa_resuelta", "score", "motivo_rechazo"]:
        assert c in cols, c


async def test_movimiento_caja_extendido(session):
    cols = await _cols(session, "movimiento_caja")
    for c in ["concepto", "categoria", "contraparte_caja_id", "pago_id", "referencia"]:
        assert c in cols, c


async def test_tablas_caja_arqueo_novacion_existen(session):
    tablas = await _tablas(session)
    for t in ["caja", "arqueo_caja", "novacion", "novacion_origen"]:
        assert t in tablas, t


async def test_pago_idempotency_unico(session):
    res = await session.execute(
        text(
            "SELECT indexname FROM pg_indexes "
            "WHERE tablename='pago' AND indexname='pago_idem_uq'"
        )
    )
    assert res.scalar_one_or_none() == "pago_idem_uq"
