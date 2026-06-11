from sqlalchemy import func, select

from app.idempotencia import IdempotencyKey, guardar_resultado_idempotente


async def test_guarda_una_sola_vez(session):
    r1 = await guardar_resultado_idempotente(session, "clave-1", "pago", '{"ok": true}')
    await session.commit()
    assert r1 == '{"ok": true}'

    # segunda llamada con misma (clave, operacion) devuelve la respuesta previa
    r2 = await guardar_resultado_idempotente(
        session, "clave-1", "pago", '{"ok": "otra"}'
    )
    await session.commit()
    assert r2 == '{"ok": true}'

    total = await session.execute(
        select(func.count()).select_from(IdempotencyKey).where(
            IdempotencyKey.clave == "clave-1", IdempotencyKey.operacion == "pago"
        )
    )
    assert total.scalar_one() == 1


async def test_misma_clave_distinta_operacion_coexisten(session):
    await guardar_resultado_idempotente(session, "clave-2", "pago", "a")
    await guardar_resultado_idempotente(session, "clave-2", "desembolso", "b")
    await session.commit()
    total = await session.execute(
        select(func.count()).select_from(IdempotencyKey).where(
            IdempotencyKey.clave == "clave-2"
        )
    )
    assert total.scalar_one() == 2
