from pydantic import BaseModel

from app.tipos import MontoStr, TasaStr


class RentabilidadItem(BaseModel):
    clave: str
    n_prestamos: int
    capital: MontoStr
    interes_cobrado: MontoStr
    comision: MontoStr
    gastos: MontoStr
    costo_fondeo: MontoStr
    pe_monetaria: MontoStr
    margen_bruto: MontoStr
    margen_neto: MontoStr
    rentabilidad_pct: TasaStr


class ResumenAnalytics(BaseModel):
    capital_total: MontoStr
    margen_neto_total: MontoStr
    pe_monetaria_total: MontoStr
    rentabilidad_global: TasaStr
    n_prestamos: int
    mejor_producto: str | None
    peor_producto: str | None
