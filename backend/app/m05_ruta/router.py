import uuid
from datetime import date
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.deps import SessionDep, requiere_rol
from app.errors import ErrorAPI
from app.m05_ruta import servicio
from app.m05_ruta.schemas import (
    DescargoEstadoIn,
    DescargoIn,
    DescargoOut,
    GenerarRendicionIn,
    GenerarRutaIn,
    ParadaConSaldoOut,
    ParadaOut,
    RendicionDetalleOut,
    RendicionEstadoIn,
    RendicionOut,
    RutaDetalleOut,
    RutaOut,
    SyncIn,
    SyncOut,
    VisitarIn,
    VisitarOut,
)
from app.m05_ruta.sync import sincronizar
from app.m12_auth.modelos import Usuario

router = APIRouter(tags=["ruta"])

RutaUser = Annotated[Usuario, Depends(requiere_rol("admin", "cobrador"))]
AdminUser = Annotated[Usuario, Depends(requiere_rol("admin"))]


async def _get_ruta(session, ruta_id: uuid.UUID):
    ruta = await servicio.obtener_ruta(session, ruta_id)
    if ruta is None:
        raise ErrorAPI("ruta_no_encontrada", "ruta inexistente", status=404)
    return ruta


def _es_admin(actor: Usuario) -> bool:
    """Check if actor has admin role."""
    return any(r.nombre == "admin" for r in actor.roles)


async def _get_ruta_propia(session, ruta_id: uuid.UUID, actor: Usuario):
    """Load ruta and raise 403 if actor is not admin and is not the assigned cobrador."""
    ruta = await _get_ruta(session, ruta_id)
    if not _es_admin(actor) and ruta.cobrador_id != actor.id:
        raise ErrorAPI("acceso_denegado", "no tenés acceso a esta ruta", status=403)
    return ruta


def _parada_out(p) -> ParadaOut:
    return ParadaOut(
        id=p.id, ruta_id=p.ruta_id, prestamo_id=p.prestamo_id, orden=p.orden,
        resultado=p.resultado, monto_cobrado=p.monto_cobrado, foto_url=p.foto_url,
        lat=str(p.lat) if p.lat is not None else None,
        lng=str(p.lng) if p.lng is not None else None,
        notas=p.notas, visitada_en=p.visitada_en,
    )


@router.post("/rutas", response_model=RutaOut, status_code=201)
async def crear_ruta(
    datos: GenerarRutaIn, session: SessionDep, actor: RutaUser
) -> RutaOut:
    ruta = await servicio.generar_ruta(
        session, cobrador_id=datos.cobrador_id, fecha=datos.fecha, actor_id=actor.id
    )
    return RutaOut.model_validate(ruta)


@router.get("/rutas", response_model=list[RutaOut])
async def listar_rutas(
    session: SessionDep,
    _: RutaUser,
    fecha: Annotated[date | None, Query()] = None,
    estado: Annotated[str | None, Query()] = None,
    cobrador_id: Annotated[uuid.UUID | None, Query()] = None,
) -> list[RutaOut]:
    rutas = await servicio.listar_rutas(
        session, fecha=fecha, estado=estado, cobrador_id=cobrador_id
    )
    return [RutaOut.model_validate(r) for r in rutas]


@router.get("/rutas/{ruta_id}", response_model=RutaDetalleOut)
async def detalle_ruta(
    ruta_id: uuid.UUID, session: SessionDep, actor: RutaUser
) -> RutaDetalleOut:
    ruta = await _get_ruta_propia(session, ruta_id, actor)
    paradas = await servicio.paradas_de_ruta(session, ruta_id)
    return RutaDetalleOut(
        id=ruta.id, cobrador_id=ruta.cobrador_id, fecha=ruta.fecha, estado=ruta.estado,
        paradas=[_parada_out(p) for p in paradas],
    )


@router.get("/rutas/{ruta_id}/paradas", response_model=list[ParadaConSaldoOut])
async def listar_paradas(
    ruta_id: uuid.UUID, session: SessionDep, _: RutaUser
) -> list[ParadaConSaldoOut]:
    from app.m03_prestamos.servicio import obtener_prestamo

    ruta = await _get_ruta(session, ruta_id)
    paradas = await servicio.paradas_de_ruta(session, ruta_id)
    salida: list[ParadaConSaldoOut] = []
    for p in paradas:
        prestamo = await obtener_prestamo(session, p.prestamo_id)
        saldo = (
            await servicio.saldo_exigible_prestamo(
                session, prestamo, ruta.fecha or date.today()
            )
            if prestamo is not None
            else None
        )
        base = _parada_out(p)
        salida.append(
            ParadaConSaldoOut(
                **base.model_dump(), saldo_exigible=saldo or Decimal("0")
            )
        )
    return salida


@router.post(
    "/rutas/{ruta_id}/paradas/{parada_id}/visitar", response_model=VisitarOut
)
async def visitar_parada(
    ruta_id: uuid.UUID,
    parada_id: uuid.UUID,
    datos: VisitarIn,
    session: SessionDep,
    actor: RutaUser,
) -> VisitarOut:
    ruta = await _get_ruta_propia(session, ruta_id, actor)
    parada = await servicio.obtener_parada(session, parada_id)
    if parada is None or parada.ruta_id != ruta_id:
        raise ErrorAPI("parada_no_encontrada", "parada inexistente", status=404)
    parada, pago_id = await servicio.visitar(
        session, ruta=ruta, parada=parada, resultado=datos.resultado,
        monto_cobrado=datos.monto_cobrado, foto_url=datos.foto_url, lat=datos.lat,
        lng=datos.lng, notas=datos.notas, caja_id=datos.caja_id,
        fecha_negocio=datos.fecha_negocio, actor_id=actor.id,
    )
    return VisitarOut(parada_id=parada.id, resultado=datos.resultado, pago_id=pago_id)


@router.post("/rutas/{ruta_id}/sync", response_model=SyncOut)
async def sync_ruta(
    ruta_id: uuid.UUID, datos: SyncIn, session: SessionDep, actor: RutaUser
) -> SyncOut:
    ruta = await _get_ruta_propia(session, ruta_id, actor)
    return await sincronizar(
        session, ruta=ruta, paradas=datos.paradas, caja_id=datos.caja_id,
        actor_id=actor.id,
    )


# ---------- Rendiciones ----------
@router.post("/rendiciones", response_model=RendicionOut, status_code=201)
async def crear_rendicion(
    datos: GenerarRendicionIn, session: SessionDep, actor: RutaUser
) -> RendicionOut:
    rendicion = await servicio.generar_rendicion(
        session, ruta_id=datos.ruta_id, fecha_negocio=datos.fecha_negocio,
        actor_id=actor.id,
    )
    return RendicionOut.model_validate(rendicion)


@router.get("/rendiciones", response_model=list[RendicionOut])
async def listar_rendiciones(session: SessionDep, _: RutaUser) -> list[RendicionOut]:
    rends = await servicio.listar_rendiciones(session)
    return [RendicionOut.model_validate(r) for r in rends]


async def _get_rendicion(session, rendicion_id: uuid.UUID):
    rend = await servicio.obtener_rendicion(session, rendicion_id)
    if rend is None:
        raise ErrorAPI("rendicion_no_encontrada", "rendicion inexistente", status=404)
    return rend


@router.get("/rendiciones/{rendicion_id}", response_model=RendicionDetalleOut)
async def detalle_rendicion(
    rendicion_id: uuid.UUID, session: SessionDep, _: RutaUser
) -> RendicionDetalleOut:
    rend = await _get_rendicion(session, rendicion_id)
    descargos = await servicio.descargos_de(session, rendicion_id)
    return RendicionDetalleOut(
        id=rend.id, ruta_id=rend.ruta_id, cobrador_id=rend.cobrador_id,
        fecha_negocio=rend.fecha_negocio, total_cobrado=rend.total_cobrado,
        total_descargos=rend.total_descargos, diferencia=rend.diferencia,
        estado=rend.estado,
        descargos=[DescargoOut.model_validate(d) for d in descargos],
    )


@router.post("/rendiciones/{rendicion_id}/descargos", response_model=DescargoOut, status_code=201)
async def agregar_descargo(
    rendicion_id: uuid.UUID, datos: DescargoIn, session: SessionDep, actor: RutaUser
) -> DescargoOut:
    rend = await _get_rendicion(session, rendicion_id)
    descargo = await servicio.agregar_descargo(
        session, rendicion=rend, concepto=datos.concepto, monto=datos.monto,
        actor_id=actor.id,
    )
    return DescargoOut.model_validate(descargo)


@router.patch(
    "/rendiciones/{rendicion_id}/descargos/{descargo_id}", response_model=DescargoOut
)
async def decidir_descargo(
    rendicion_id: uuid.UUID,
    descargo_id: uuid.UUID,
    datos: DescargoEstadoIn,
    session: SessionDep,
    actor: AdminUser,
) -> DescargoOut:
    rend = await _get_rendicion(session, rendicion_id)
    descargo = await servicio.decidir_descargo(
        session, rendicion=rend, descargo_id=descargo_id, estado=datos.estado,
        actor_id=actor.id,
    )
    return DescargoOut.model_validate(descargo)


@router.patch("/rendiciones/{rendicion_id}", response_model=RendicionOut)
async def cambiar_estado_rendicion(
    rendicion_id: uuid.UUID,
    datos: RendicionEstadoIn,
    session: SessionDep,
    actor: RutaUser,
) -> RendicionOut:
    rend = await _get_rendicion(session, rendicion_id)
    rend = await servicio.cambiar_estado_rendicion(
        session, rendicion=rend, estado=datos.estado, actor_id=actor.id
    )
    return RendicionOut.model_validate(rend)
