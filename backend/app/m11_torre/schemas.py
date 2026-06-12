from datetime import date

from pydantic import BaseModel

from app.tipos import MetricaStr, MontoStr


class ResumenOut(BaseModel):
    tiene_snapshot: bool
    periodo: date | None
    indice_nexo: MetricaStr  # 0-100; 0 si no hay snapshot
    prestamos_vigentes: int
    prestamos_en_mora: int


class TarjetaPulso(BaseModel):
    clave: str
    etiqueta: str
    valor: str


class PulsoOut(BaseModel):
    tiene_snapshot: bool
    periodo: date | None
    tarjetas: list[TarjetaPulso]


class SaludCarteraOut(BaseModel):
    tiene_snapshot: bool
    aging: dict[str, MontoStr]
    perdida_esperada: MontoStr
    cosechas: list[dict]
    cashflow: list[dict]


class OperacionHoyOut(BaseModel):
    cobranza_del_dia: MontoStr
    cuotas_vencen_hoy: int
    rutas_activas: int
    promesas_pendientes: int
    pipeline_solicitudes: int


class TopItem(BaseModel):
    clave: str
    valor: MontoStr


class NegocioOut(BaseModel):
    tiene_snapshot: bool
    colocacion_mes: MontoStr
    intereses_cobrados_mes: MontoStr
    punitorios_cobrados_mes: MontoStr
    top_vendedores: list[TopItem]
    top_productos: list[TopItem]


class AlertaLiveOut(BaseModel):
    id: str
    tipo: str | None
    severidad: str | None
    metrica: str | None
    valor: MetricaStr | None
    prestamo_id: str | None
    persona_id: str | None


class AlertasLiveOut(BaseModel):
    total: int
    alertas: list[AlertaLiveOut]
