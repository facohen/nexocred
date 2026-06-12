"""Helpers compartidos para los tests de integracion F1c."""


async def relajar_bcra(client, token) -> None:
    """El fake BCRA fija fecha_informe a date(2026, mes, 1) segun la semilla de la
    persona, por lo que algunas quedan fuera de la vigencia por defecto (30 dias).
    Para tests que crean varias personas, ampliamos la vigencia."""
    await client.patch(
        "/api/v1/parametros",
        json={"bcra_vigencia_dias": 100000},
        headers={"Authorization": f"Bearer {token}"},
    )


def cuil_valido(dni: str, prefijo: str = "20") -> str:
    base = prefijo + dni
    pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
    s = sum(int(d) * p for d, p in zip(base, pesos, strict=False))
    v = 11 - (s % 11)
    if v == 11:
        v = 0
    if v == 10:
        v = 9
    return base + str(v)
