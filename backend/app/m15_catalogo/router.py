import uuid

from fastapi import APIRouter, Query

from app.deps import AdminUser, CurrentUser, SessionDep
from app.errors import ErrorAPI
from app.m15_catalogo import servicio
from app.m15_catalogo.modelos import ProductoCredito
from app.m15_catalogo.schemas import (
    CeldaComisionOut,
    CeldaTasaOut,
    GastoOut,
    MatrizComisionIn,
    MatrizTasaIn,
    PerfilCreate,
    PerfilOut,
    ProductoCreate,
    ProductoOut,
    ProductoUpdate,
    RepricingIn,
    RepricingPreviewOut,
    RepricingResultadoOut,
    SimuladorInternoIn,
    SimuladorLibreIn,
    SimuladorOut,
)
from app.paginacion import Pagina, paginar

router = APIRouter(tags=["catalogo"])


async def _producto_out(session, producto: ProductoCredito) -> ProductoOut:
    out = ProductoOut.model_validate(producto)
    version = await servicio.version_vigente(session, producto)
    if version is not None:
        out.periodicidad = version.periodicidad
        out.plazos_permitidos = servicio._csv_to_plazos(version.plazos_permitidos)
        out.monto_minimo = version.monto_minimo
        out.monto_maximo = version.monto_maximo
    out.gastos = [
        GastoOut.model_validate(g) for g in await servicio.gastos_de(session, producto.id)
    ]
    return out


# ---------- productos ----------
@router.post("/productos", response_model=ProductoOut, status_code=201)
async def crear_producto(
    datos: ProductoCreate, session: SessionDep, actor: AdminUser
) -> ProductoOut:
    producto = await servicio.crear_producto(session, datos, actor_id=actor.id)
    await session.commit()
    producto = await servicio.obtener_producto(session, producto.id)
    assert producto is not None
    return await _producto_out(session, producto)


@router.get("/productos", response_model=Pagina[ProductoOut])
async def listar_productos(
    session: SessionDep,
    _: CurrentUser,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
) -> Pagina[ProductoOut]:
    productos = await servicio.listar_productos(session)
    items = [await _producto_out(session, p) for p in productos]
    return paginar(items, page, per_page)


# ---------- repricing ----------
@router.post("/productos/repricing", response_model=RepricingPreviewOut)
async def repricing_preview(
    datos: RepricingIn, session: SessionDep, _: AdminUser
) -> RepricingPreviewOut:
    cambios = await servicio.repricing_preview(session, datos.ajustes)
    return RepricingPreviewOut(cambios=cambios)


@router.post("/productos/repricing/confirmar", response_model=RepricingResultadoOut)
async def repricing_confirmar(
    datos: RepricingIn, session: SessionDep, actor: AdminUser
) -> RepricingResultadoOut:
    cambios, versionados = await servicio.repricing_confirmar(
        session, datos.ajustes, actor_id=actor.id
    )
    await session.commit()
    return RepricingResultadoOut(cambios=cambios, productos_versionados=versionados)


@router.get("/productos/{producto_id}", response_model=ProductoOut)
async def detalle_producto(
    producto_id: uuid.UUID, session: SessionDep, _: CurrentUser
) -> ProductoOut:
    producto = await servicio.obtener_producto(session, producto_id)
    if producto is None:
        raise ErrorAPI("producto_inexistente", "producto no encontrado", status=404)
    return await _producto_out(session, producto)


@router.patch("/productos/{producto_id}", response_model=ProductoOut)
async def actualizar_producto(
    producto_id: uuid.UUID,
    datos: ProductoUpdate,
    session: SessionDep,
    actor: AdminUser,
) -> ProductoOut:
    producto = await servicio.obtener_producto(session, producto_id)
    if producto is None:
        raise ErrorAPI("producto_inexistente", "producto no encontrado", status=404)
    cambios = datos.model_dump(exclude_unset=True)
    await servicio.actualizar_producto(session, producto, cambios, actor_id=actor.id)
    await session.commit()
    producto = await servicio.obtener_producto(session, producto_id)
    assert producto is not None
    return await _producto_out(session, producto)


@router.post("/productos/{producto_id}/publicar", response_model=ProductoOut)
async def publicar_producto(
    producto_id: uuid.UUID, session: SessionDep, actor: AdminUser
) -> ProductoOut:
    producto = await servicio.obtener_producto(session, producto_id)
    if producto is None:
        raise ErrorAPI("producto_inexistente", "producto no encontrado", status=404)
    await servicio.publicar_producto(session, producto, actor_id=actor.id)
    await session.commit()
    producto = await servicio.obtener_producto(session, producto_id)
    assert producto is not None
    return await _producto_out(session, producto)


# ---------- perfiles ----------
@router.post("/perfiles-pricing", response_model=PerfilOut, status_code=201)
async def crear_perfil(
    datos: PerfilCreate, session: SessionDep, actor: AdminUser
) -> PerfilOut:
    perfil = await servicio.crear_perfil(
        session, datos.nombre, datos.descripcion, datos.orden, actor_id=actor.id
    )
    await session.commit()
    return PerfilOut.model_validate(perfil)


@router.get("/perfiles-pricing", response_model=Pagina[PerfilOut])
async def listar_perfiles(
    session: SessionDep,
    _: CurrentUser,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
) -> Pagina[PerfilOut]:
    perfiles = await servicio.listar_perfiles(session)
    return paginar([PerfilOut.model_validate(p) for p in perfiles], page, per_page)


# ---------- matrices ----------
@router.put("/matrices/tasas", response_model=list[CeldaTasaOut])
async def actualizar_matriz_tasas(
    datos: MatrizTasaIn, session: SessionDep, actor: AdminUser
) -> list[CeldaTasaOut]:
    celdas = await servicio.upsert_matriz_tasas(
        session, datos.celdas, actor_id=actor.id
    )
    await session.commit()
    return [CeldaTasaOut.model_validate(c) for c in celdas]


@router.get("/matrices/tasas", response_model=Pagina[CeldaTasaOut])
async def listar_matriz_tasas(
    session: SessionDep,
    _: CurrentUser,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
) -> Pagina[CeldaTasaOut]:
    celdas = await servicio.listar_matriz_tasas(session)
    return paginar([CeldaTasaOut.model_validate(c) for c in celdas], page, per_page)


@router.put("/matrices/comisiones", response_model=list[CeldaComisionOut])
async def actualizar_matriz_comisiones(
    datos: MatrizComisionIn, session: SessionDep, actor: AdminUser
) -> list[CeldaComisionOut]:
    celdas = await servicio.upsert_matriz_comisiones(
        session, datos.celdas, actor_id=actor.id
    )
    await session.commit()
    return [CeldaComisionOut.model_validate(c) for c in celdas]


@router.get("/matrices/comisiones", response_model=Pagina[CeldaComisionOut])
async def listar_matriz_comisiones(
    session: SessionDep,
    _: CurrentUser,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
) -> Pagina[CeldaComisionOut]:
    celdas = await servicio.listar_matriz_comisiones(session)
    return paginar(
        [CeldaComisionOut.model_validate(c) for c in celdas], page, per_page
    )


# ---------- simuladores ----------
@router.post("/simulador/otorgante", response_model=SimuladorOut)
async def simulador_otorgante(
    datos: SimuladorLibreIn, _: CurrentUser
) -> SimuladorOut:
    return servicio.simular_libre(datos)


@router.post("/simulador/cotizador", response_model=SimuladorOut)
async def simulador_cotizador(
    datos: SimuladorLibreIn, _: CurrentUser
) -> SimuladorOut:
    return servicio.simular_libre(datos)


@router.post("/simulador/interno", response_model=SimuladorOut)
async def simulador_interno(
    datos: SimuladorInternoIn, session: SessionDep, _: CurrentUser
) -> SimuladorOut:
    return await servicio.simular_interno(session, datos)
