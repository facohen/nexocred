from datetime import date
from decimal import Decimal

from nexocred_core.cronograma import calcular_cronograma
from nexocred_core.modelos import Periodicidad, TerminosPrestamo
from nexocred_core.payoff import calcular_payoff


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


def test_payoff_sin_atraso_es_capital_mas_interes_total():
    # antes del primer vencimiento, nada exigible/punitorio
    res = calcular_payoff(_cronograma(), (), date(2026, 1, 9), Decimal("0.001"))
    assert res.capital == Decimal("10000.00")
    assert res.interes == Decimal("1000.00")
    assert res.punitorio == Decimal("0.00")
    assert res.total == Decimal("11000.00")


def test_payoff_incluye_punitorio_de_cuotas_vencidas():
    # cuota 1 vencida 10 dias: punitorio 2000*0.001*10 = 20
    res = calcular_payoff(_cronograma(), (), date(2026, 1, 20), Decimal("0.001"))
    assert res.punitorio == Decimal("20.00")
    assert res.total == Decimal("11020.00")
