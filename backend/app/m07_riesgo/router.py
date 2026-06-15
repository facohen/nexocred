import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.deps import SessionDep, requiere_rol
from app.errors import ErrorAPI
from app.m07_riesgo import alarmas
from app.m07_riesgo.metricas import (
    aging,
    concentracion,
    cosechas,
    par,
    perdida_esperada,
    porcentaje_refinanciado,
)
from app.m07_riesgo.schemas import (
    AlertaOut,
    AsignarAlertaIn,
    ConcentracionItem,
    CosechaOut,
    ProcesarOut,
    ResolverAlertaIn,
    TableroOut,
)
from app.m07_riesgo.servicio import cartera_riesgo
from app.m12_auth.modelos import Usuario
from app.paginacion import Pagina, paginar
from nexocred_core import CERO, sumar

router = APIRouter(tags=["riesgo"])

RiesgoUser = Annotated[Usuario, Depends(requiere_rol("analista_riesgo", "ceo"))]
AdminUser = Annotated[Usuario, Depends(requiere_rol("analista_riesgo"))]


@router.get("/riesgo/tablero", response_model=TableroOut)
async def tablero(session: SessionDep, _: RiesgoUser) -> TableroOut:
    cartera = await cartera_riesgo(session)
    total = sumar(*(c.capital_pendiente for c in cartera)) if cartera else CERO
    return TableroOut(
        par30=par(cartera, 30),
        par60=par(cartera, 60),
        par90=par(cartera, 90),
        aging=aging(cartera),
        porcentaje_refinanciado=porcentaje_refinanciado(cartera),
        perdida_esperada=perdida_esperada(cartera),
        cartera_total=total,
    )


@router.get("/riesgo/cosechas", response_model=Pagina[CosechaOut])
async def cosechas_endpoint(
    session: SessionDep,
    _: RiesgoUser,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
) -> Pagina[CosechaOut]:
    cartera = await cartera_riesgo(session)
    cos = cosechas(cartera)
    items = [
        CosechaOut(mes=mes, capital=v["capital"], mora=v["mora"],
                   ratio_mora=v["ratio_mora"])
        for mes, v in cos.items()
    ]
    return paginar(items, page, per_page)


@router.get("/riesgo/concentracion", response_model=Pagina[ConcentracionItem])
async def concentracion_endpoint(
    session: SessionDep,
    _: RiesgoUser,
    clave: Annotated[str, Query()] = "producto_id",
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
) -> Pagina[ConcentracionItem]:
    if clave not in ("cliente_id", "zona", "vendedor_id", "producto_id"):
        raise ErrorAPI("clave_invalida", f"clave invalida: {clave}", status=422)
    cartera = await cartera_riesgo(session)
    shares = concentracion(cartera, clave)
    items = [
        ConcentracionItem(clave=clave, valor=k, share=v) for k, v in shares.items()
    ]
    return paginar(items, page, per_page)


# ---------- Alertas ----------
@router.get("/alertas", response_model=Pagina[AlertaOut])
async def listar_alertas(
    session: SessionDep,
    _: RiesgoUser,
    estado: Annotated[str | None, Query()] = None,
    severidad: Annotated[str | None, Query()] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
) -> Pagina[AlertaOut]:
    items = await alarmas.listar_alertas(session, estado=estado, severidad=severidad)
    return paginar([AlertaOut.model_validate(a) for a in items], page, per_page)


async def _get_alerta(session, alerta_id: uuid.UUID):
    alerta = await alarmas.obtener_alerta(session, alerta_id)
    if alerta is None:
        raise ErrorAPI("alerta_no_encontrada", "alerta inexistente", status=404)
    return alerta


@router.get("/alertas/{alerta_id}", response_model=AlertaOut)
async def detalle_alerta(
    alerta_id: uuid.UUID, session: SessionDep, _: RiesgoUser
) -> AlertaOut:
    alerta = await _get_alerta(session, alerta_id)
    return AlertaOut.model_validate(alerta)


@router.patch("/alertas/{alerta_id}/resolver", response_model=AlertaOut)
async def resolver_alerta(
    alerta_id: uuid.UUID,
    datos: ResolverAlertaIn,
    session: SessionDep,
    actor: RiesgoUser,
) -> AlertaOut:
    alerta = await _get_alerta(session, alerta_id)
    alerta = await alarmas.resolver(
        session, alerta=alerta, justificacion=datos.justificacion, actor_id=actor.id
    )
    return AlertaOut.model_validate(alerta)


@router.patch("/alertas/{alerta_id}/asignar", response_model=AlertaOut)
async def asignar_alerta(
    alerta_id: uuid.UUID,
    datos: AsignarAlertaIn,
    session: SessionDep,
    actor: RiesgoUser,
) -> AlertaOut:
    alerta = await _get_alerta(session, alerta_id)
    alerta = await alarmas.asignar(
        session, alerta=alerta, operador_id=datos.operador_id, actor_id=actor.id
    )
    return AlertaOut.model_validate(alerta)


@router.post("/alertas/procesar", response_model=ProcesarOut)
async def procesar_alarmas(session: SessionDep, actor: AdminUser) -> ProcesarOut:
    creadas, existentes = await alarmas.procesar(session, actor_id=actor.id)
    return ProcesarOut(creadas=creadas, existentes=existentes)
