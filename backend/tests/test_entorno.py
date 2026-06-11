from decimal import Decimal

import nexocred_core


def test_entorno_python_y_decimal():
    assert Decimal("0.10") + Decimal("0.20") == Decimal("0.30")


def test_importa_nexocred_core():
    assert nexocred_core.__doc__ == "Core financiero puro de NexoCred."
