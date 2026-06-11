"""Correccion pura: reversa total del pago original + pago de reemplazo. Sin persistencia."""

from nexocred_core.modelos import Imputacion, ResultadoCorreccion, ResultadoPago


def corregir_pago(original: ResultadoPago, reemplazo: ResultadoPago) -> ResultadoCorreccion:
    reversas = tuple(
        Imputacion(
            concepto=imp.concepto,
            monto=-imp.monto,
            orden_waterfall=imp.orden_waterfall,
            cuota_numero=imp.cuota_numero,
        )
        for imp in original.imputaciones
    )
    return ResultadoCorreccion(reversas=reversas, reemplazo=reemplazo)
