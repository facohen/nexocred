from datetime import date
from decimal import Decimal

from nexocred_core.cronograma import calcular_cronograma
from nexocred_core.modelos import (
    ConceptoImputacion,
    Imputacion,
    Periodicidad,
    TerminosPrestamo,
)
from nexocred_core.saldo import calcular_saldo_exigible


def _cronograma():
    return calcular_cronograma(
        TerminosPrestamo(
            capital=Decimal("10000.00"),
            tasa_interes_directo=Decimal("0.10"),
            cantidad_cuotas=5,
            periodicidad=Periodicidad.MENSUAL,
            fecha_primera_cuota=date(2026, 1, 10),
            tasa_punitorio_diario=Decimal("0.001"),
        )
    )


def test_nada_exigible_antes_de_primer_vencimiento():
    saldo = calcular_saldo_exigible(_cronograma(), (), date(2026, 1, 9), Decimal("0.001"))
    assert saldo.total_exigible == Decimal("0.00")
    assert len(saldo.cuotas) == 0
    assert saldo.capital_no_vencido == Decimal("10000.00")
    assert saldo.interes_no_vencido == Decimal("1000.00")


def test_una_cuota_vencida_exacta_sin_atraso():
    # En la fecha de vencimiento, exigible = cuota, punitorio = 0
    saldo = calcular_saldo_exigible(_cronograma(), (), date(2026, 1, 10), Decimal("0.001"))
    assert len(saldo.cuotas) == 1
    c = saldo.cuotas[0]
    assert c.punitorio == Decimal("0.00")
    assert c.interes == Decimal("200.00")
    assert c.capital == Decimal("2000.00")
    assert c.total_exigible == Decimal("2200.00")


def test_punitorio_por_dias_de_atraso():
    # 10 dias de atraso sobre capital 2000 a 0.001/dia = 2000*0.001*10 = 20.00
    saldo = calcular_saldo_exigible(_cronograma(), (), date(2026, 1, 20), Decimal("0.001"))
    c = saldo.cuotas[0]
    assert c.punitorio == Decimal("20.00")


def test_dos_cuotas_vencidas_se_acumulan():
    saldo = calcular_saldo_exigible(_cronograma(), (), date(2026, 2, 10), Decimal("0.001"))
    assert len(saldo.cuotas) == 2
    assert saldo.capital_no_vencido == Decimal("6000.00")  # 3 cuotas * 2000


def test_imputacion_previa_reduce_lo_exigible():
    # ya se imputaron 2000 a capital_vencido de cuota 1
    imps = (
        Imputacion(ConceptoImputacion.CAPITAL_VENCIDO, Decimal("2000.00"), 3, cuota_numero=1),
        Imputacion(ConceptoImputacion.INTERES_VENCIDO, Decimal("200.00"), 2, cuota_numero=1),
    )
    saldo = calcular_saldo_exigible(_cronograma(), imps, date(2026, 1, 10), Decimal("0.001"))
    # cuota 1 ya saldada -> no exigible
    assert all(c.numero != 1 or c.total_exigible == Decimal("0.00") for c in saldo.cuotas)
