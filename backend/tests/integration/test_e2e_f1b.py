"""End-to-end de conservacion de dinero: persona -> solicitud -> aprobar ->
desembolsar -> pagar -> corregir. En cada paso el dinero se conserva."""

from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import text

from tests.api.test_solicitudes import (
    cargar_tasa,
    crear_perfil,
    crear_persona,
    crear_producto,
    crear_solicitud,
    sync_bcra,
)
from tests.integration.test_desembolso import _crear_caja


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _suma_imputaciones_no_excedente(session, pago_id) -> Decimal:
    res = await session.execute(
        text(
            "SELECT coalesce(sum(monto),0) FROM imputacion "
            "WHERE pago_id=:p AND concepto<>'excedente'"
        ),
        {"p": pago_id},
    )
    return res.scalar_one()


async def test_e2e_conserva_dinero(client, admin_token, session):
    # 1) persona + producto + perfil + tasa + BCRA
    persona = await crear_persona(client, admin_token)
    producto = await crear_producto(client, admin_token)
    perfil = await crear_perfil(client, admin_token)
    await cargar_tasa(client, admin_token, producto, perfil, 6, tasa="0.30")
    await sync_bcra(client, admin_token, persona)

    # 2) solicitud -> evaluar -> aprobar
    sid = await crear_solicitud(client, admin_token, persona, producto, cantidad_cuotas=6)
    await client.post(f"/api/v1/solicitudes/{sid}/evaluar", headers=_h(admin_token))
    r = await client.patch(
        f"/api/v1/solicitudes/{sid}/estado",
        json={"estado": "aprobada"}, headers=_h(admin_token),
    )
    assert r.status_code == 200, r.text

    # 3) desembolsar
    caja = await _crear_caja(client, admin_token)
    fpc = (date.today() - timedelta(days=30)).isoformat()  # primera cuota vencida
    r = await client.post(
        f"/api/v1/solicitudes/{sid}/desembolsar",
        json={"caja_id": caja, "fecha_negocio": date.today().isoformat(),
              "fecha_primera_cuota": fpc},
        headers={**_h(admin_token), "Idempotency-Key": "e2e-des"},
    )
    assert r.status_code == 201, r.text
    prestamo_id = r.json()["prestamo_id"]
    # caja debitada por el capital
    res = await session.execute(
        text("SELECT saldo_teorico FROM caja WHERE id=:c"), {"c": caja}
    )
    assert res.scalar_one() == Decimal("-100000.00")

    # 4) pagar: reconciliacion pago == imputaciones + excedente == movimiento de caja
    r = await client.post(
        "/api/v1/pagos",
        json={"prestamo_id": prestamo_id, "monto": "21666.67", "canal": "mostrador",
              "caja_id": caja, "fecha_negocio": date.today().isoformat()},
        headers={**_h(admin_token), "Idempotency-Key": "e2e-pago"},
    )
    assert r.status_code == 201, r.text
    pago_id = r.json()["id"]
    imputado = await _suma_imputaciones_no_excedente(session, pago_id)
    res = await session.execute(
        text("SELECT excedente, monto FROM pago WHERE id=:p"), {"p": pago_id}
    )
    excedente, monto = res.one()
    assert imputado + excedente == monto == Decimal("21666.67")
    res = await session.execute(
        text("SELECT monto FROM movimiento_caja WHERE pago_id=:p"), {"p": pago_id}
    )
    assert res.scalar_one() == Decimal("21666.67")

    # 5) corregir: append-only, contra-asiento balancea a cero
    res = await session.execute(
        text("SELECT coalesce(sum(monto),0) FROM imputacion WHERE pago_id=:p"),
        {"p": pago_id},
    )
    suma_original = res.scalar_one()
    r = await client.post(
        f"/api/v1/pagos/{pago_id}/corregir",
        json={"monto": "25000.00", "canal": "mostrador", "caja_id": caja,
              "fecha_negocio": date.today().isoformat()},
        headers={**_h(admin_token), "Idempotency-Key": "e2e-corr"},
    )
    assert r.status_code == 201, r.text
    # original + reversas == 0
    res = await session.execute(
        text(
            "SELECT coalesce(sum(i.monto),0) FROM imputacion i "
            "JOIN pago p ON i.pago_id=p.id WHERE p.estado='reversa'"
        )
    )
    suma_reversas = res.scalar_one()
    assert suma_original + suma_reversas == Decimal("0")
    # original intacto
    res = await session.execute(
        text("SELECT estado FROM pago WHERE id=:p"), {"p": pago_id}
    )
    assert res.scalar_one() == "corregido"

    # conservacion final: el ledger de caja iguala al saldo_teorico persistido.
    res = await session.execute(
        text(
            "SELECT coalesce(sum(CASE WHEN tipo='ingreso' THEN monto ELSE -monto END),0) "
            "FROM movimiento_caja WHERE caja_id=:c"
        ),
        {"c": caja},
    )
    ledger = res.scalar_one()
    res = await session.execute(
        text("SELECT saldo_teorico FROM caja WHERE id=:c"), {"c": caja}
    )
    assert ledger == res.scalar_one()
