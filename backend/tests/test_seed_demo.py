"""Task 4: la siembra demo es determinista, idempotente y produce Torre significativa."""

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.jobs.snapshot import generar_snapshot
from app.m01_personas.modelos import Persona
from app.m11_torre import servicio as torre
from app.modelos_stub import Pago, Prestamo, SnapshotCartera
from scripts.seed_demo import FECHA_DEMO, sembrar_demo
from tests.conftest import make_test_engine

pytestmark = pytest.mark.asyncio

_TABLAS = (
    "rendicion_descargo, rendicion, "
    "comision_liquidacion_detalle, comision_liquidacion, "
    "interaccion, asignacion_crm, prospecto, "
    "imputacion, pago, cuota, parada_ruta, ruta_diaria, comision_devengo, "
    "liquidacion_detalle, liquidacion_comision, documento_emitido, "
    "documento_numero, aporte_retiro, "
    "novacion_origen, novacion, "
    "arqueo_caja, movimiento_caja, caja, prestamo, "
    "solicitud_credito, workflow_ejecucion, workflow_regla, "
    "alerta, incidente, tarea, snapshot_cartera, "
    "matriz_tasa, matriz_comision, gasto_originacion, producto_version, "
    "producto_credito, perfil_pricing, "
    "persona_deuda_bcra, persona_marca, persona_referencia, persona, "
    "auditoria_evento, idempotency_key, usuario_rol, usuario, rol"
)


async def _truncar_todo() -> None:
    """Resetea el esquema completo para un test de siembra autocontenido (la DB de
    test es session-scoped y los tests de seed comparten estado committeado)."""
    from sqlalchemy import text

    engine = make_test_engine(isolation_level="AUTOCOMMIT")
    async with engine.connect() as conn:
        await conn.execute(text(f"TRUNCATE {_TABLAS} RESTART IDENTITY CASCADE"))
    await engine.dispose()


async def _contar(session, modelo) -> int:
    return await session.scalar(select(func.count()).select_from(modelo))


async def test_seed_crea_portafolio_realista(session):
    res = await sembrar_demo(session)
    assert res["personas"] >= 18
    assert res["prestamos"] >= 1
    assert res["pagos"] >= 1

    personas = await _contar(session, Persona)
    prestamos = await _contar(session, Prestamo)
    pagos = await _contar(session, Pago)
    assert personas >= 18
    assert prestamos >= 1
    assert pagos >= 1


async def test_seed_no_muta_parametros_globales_y_aprueba(session):
    """MAJOR 1: la siembra NO debe mutar PARAMETROS_GLOBALES (la vigencia BCRA
    queda en su default) y aun asi los prestamos quedan aprobados/desembolsados
    (BCRA vigente via fecha_informe reciente)."""
    from app.m12_auth.router import PARAMETROS_GLOBALES

    vigencia_antes = PARAMETROS_GLOBALES.get("bcra_vigencia_dias")
    assert vigencia_antes == 30  # default

    res = await sembrar_demo(session)

    # El global NO cambio (no se debilito el camino LIVE de aprobacion).
    assert PARAMETROS_GLOBALES.get("bcra_vigencia_dias") == vigencia_antes == 30
    # Y aun asi hubo prestamos desembolsados (BCRA aprobo bajo vigencia DEFAULT).
    assert res["prestamos"] >= 1


async def test_seed_idempotente_no_duplica(session):
    await sembrar_demo(session)
    p1 = await _contar(session, Persona)
    pr1 = await _contar(session, Prestamo)
    pa1 = await _contar(session, Pago)

    await sembrar_demo(session)
    p2 = await _contar(session, Persona)
    pr2 = await _contar(session, Prestamo)
    pa2 = await _contar(session, Pago)

    assert (p1, pr1, pa1) == (p2, pr2, pa2), "re-correr la siembra no debe duplicar"


async def test_seed_idempotente_sesion_fresca(_crear_db_de_test):
    """MINOR: la idempotencia real se ejerce con sesiones SEPARADAS (commit +
    nueva sesion), no con el identity-map de la misma sesion. Re-correr en una
    sesion fresca no debe duplicar el portafolio."""
    await _truncar_todo()
    engine = make_test_engine()
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    try:
        async with maker() as s1:
            await sembrar_demo(s1)
            await s1.commit()
            c1 = (
                await _contar(s1, Persona),
                await _contar(s1, Prestamo),
                await _contar(s1, Pago),
            )
        async with maker() as s2:
            await sembrar_demo(s2)
            await s2.commit()
            c2 = (
                await _contar(s2, Persona),
                await _contar(s2, Prestamo),
                await _contar(s2, Pago),
            )
        assert c1 == c2, "re-correr en sesion fresca no debe duplicar"
        assert c1[1] >= 1
    finally:
        await engine.dispose()


async def test_seed_crash_safe_marcador_al_final(_crear_db_de_test, monkeypatch):
    """MAJOR 2: si la siembra crashea DESPUES de los prestamos pero ANTES de
    escribir el marcador final, una re-corrida COMPLETA el portafolio (no
    no-opea) y el marcador solo existe tras la finalizacion total."""
    import scripts.seed_demo as seed_mod

    await _truncar_todo()
    engine = make_test_engine()
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    try:
        # 1) Siembra parcial: inyectamos un fallo justo antes del marcador final.
        boom_called = {"n": 0}
        original = seed_mod._marcar_completo

        async def _boom(session):
            boom_called["n"] += 1
            raise RuntimeError("crash simulado pre-marcador")

        monkeypatch.setattr(seed_mod, "_marcar_completo", _boom)
        async with maker() as s1:
            with pytest.raises(RuntimeError):
                await sembrar_demo(s1)
            await s1.rollback()
        assert boom_called["n"] == 1

        # El marcador NO debe existir tras el crash.
        async with maker() as s_check:
            assert await seed_mod._ya_sembrado(s_check) is False

        # 2) Re-corrida real (sin el fallo): debe COMPLETAR, no no-opear.
        monkeypatch.setattr(seed_mod, "_marcar_completo", original)
        async with maker() as s2:
            res = await sembrar_demo(s2)
            await s2.commit()
        assert res["prestamos"] >= 1

        # 3) El marcador ya existe tras la finalizacion total.
        async with maker() as s3:
            assert await seed_mod._ya_sembrado(s3) is True
    finally:
        await engine.dispose()


async def test_seed_produce_mora_para_torre(session):
    """Debe haber prestamos en mora para que La Torre tenga senial de riesgo."""
    await sembrar_demo(session)
    await generar_snapshot(session, FECHA_DEMO, actor_id=None)
    await session.commit()

    snap = await session.scalar(
        select(SnapshotCartera).order_by(SnapshotCartera.fecha_corte.desc())
    )
    assert snap is not None
    assert snap.prestamos_vigentes > 0
    assert snap.prestamos_en_mora > 0


async def test_torre_pulso_no_vacio(session):
    await sembrar_demo(session)
    await generar_snapshot(session, FECHA_DEMO, actor_id=None)
    await session.commit()

    resumen = await torre.resumen(session)
    assert resumen["tiene_snapshot"] is True
    assert resumen["prestamos_vigentes"] > 0

    pulso = await torre.pulso(session)
    assert pulso["tiene_snapshot"] is True
    tarjetas = {t["clave"]: t["valor"] for t in pulso["tarjetas"]}
    # KPIs no-cero: cartera viva, no un estado vacio.
    assert int(tarjetas["prestamos_vigentes"]) > 0
