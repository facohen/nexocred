import uuid
from datetime import date

from pydantic import BaseModel, ConfigDict

from app.tipos import MontoStr, TasaStr


class PosicionOut(BaseModel):
    capital_disponible: MontoStr
    capital_colocado: MontoStr
    utilizacion: TasaStr
    semaforo: str  # 'verde' | 'amarillo' | 'rojo'


class CashflowTramo(BaseModel):
    dias: int
    entradas: MontoStr
    egresos: MontoStr
    neto: MontoStr
    # Horizonte en meses (nuevo): presente cuando el tramo se pide por meses. Los
    # tramos por dias (30/60/90) lo dejan en None para no romper el contrato viejo.
    meses: int | None = None


class CashflowOut(BaseModel):
    tramos: list[CashflowTramo]


class DCFEscenario(BaseModel):
    escenario: str
    tasa_mensual: TasaStr
    valor_presente: MontoStr
    # VP del escenario repartido por horizonte (0-6m / 6-12m / 12m+). Opcional para
    # backward-compat: los consumidores viejos solo leen valor_presente.
    vp_por_horizonte: list["VpHorizonte"] = []


class VpHorizonte(BaseModel):
    """Cuanto del valor presente se materializa en una ventana temporal."""

    etiqueta: str  # "0-6m" | "6-12m" | "12m+"
    valor_presente: MontoStr


class DCFPuntoCurva(BaseModel):
    """Punto de la curva de VP acumulado (escenario base) para graficar."""

    mes: int
    vp_acumulado: MontoStr


class DCFOut(BaseModel):
    flujos_nominales: MontoStr
    escenarios: list[DCFEscenario]
    # Curva de VP acumulado por mes (escenario base) — nueva, opcional.
    curva: list[DCFPuntoCurva] = []


class RotacionOut(BaseModel):
    colocacion_periodo: MontoStr
    capital_promedio: MontoStr
    rotacion_anualizada: TasaStr


class AporteRetiroIn(BaseModel):
    monto: MontoStr
    fecha_negocio: date
    caja_id: uuid.UUID
    inversor: str | None = None
    nota: str | None = None


class AporteRetiroOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tipo: str
    monto: MontoStr
    fecha_negocio: date
    caja_id: uuid.UUID | None
    movimiento_id: uuid.UUID | None
    inversor: str | None
    nota: str | None
