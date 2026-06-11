from datetime import date
from decimal import Decimal

from app.bcra.puerto import DeudaBcraNormalizada

_ENTIDADES = ("Banco Nacion", "Banco Provincia", "Tarjeta Naranja")


class FakeBcraClient:
    """Cliente BCRA deterministico para desarrollo y tests.

    Genera deudas reproducibles a partir del CUIL (mismo CUIL -> mismo resultado),
    sin I/O ni reloj del sistema: la fecha de informe se deriva del CUIL."""

    async def consultar(self, cuil: str) -> list[DeudaBcraNormalizada]:
        digitos = [int(c) for c in cuil if c.isdigit()]
        semilla = sum(digitos)
        # CUIL terminado en 0 -> sin deuda registrada (caso limpio determinista)
        if digitos and digitos[-1] == 0:
            return []
        cantidad = (semilla % 3) + 1
        deudas: list[DeudaBcraNormalizada] = []
        for i in range(cantidad):
            base = (semilla * (i + 1) * 1000) % 500000
            monto = Decimal(base).quantize(Decimal("1.00"))
            situacion = ((semilla + i) % 6) + 1
            anio = 2026
            mes = ((semilla + i) % 12) + 1
            deudas.append(
                DeudaBcraNormalizada(
                    entidad=_ENTIDADES[i % len(_ENTIDADES)],
                    monto=monto,
                    situacion=situacion,
                    fecha_informe=date(anio, mes, 1),
                )
            )
        return deudas
