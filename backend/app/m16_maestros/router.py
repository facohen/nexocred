import uuid

from fastapi import APIRouter, Query

from app.deps import ConfigUser, CurrentUser, SessionDep
from app.errors import ErrorAPI
from app.m16_maestros import servicio
from app.m16_maestros.modelos import Canal, Disposicion, Localidad, Provincia, Sector, Tema, Zona
from app.m16_maestros.schemas import (
    AsignacionVendedorIn,
    AsignacionVendedorOut,
    CatalogoCreate,
    CatalogoOut,
    CatalogoUpdate,
    DisposicionCreate,
    DisposicionOut,
    DisposicionUpdate,
    LocalidadCreate,
    LocalidadOut,
    LocalidadUpdate,
    ProvinciaCreate,
    ProvinciaOut,
    ProvinciaUpdate,
    VendedorConAsignacionOut,
)
from app.paginacion import Pagina, paginar

router = APIRouter(prefix="/maestros", tags=["maestros"])


# ---------- helpers ----------
def _paginar(items: list, page: int, per_page: int):
    return paginar(items, page, per_page)


# ---------- Zonas ----------
@router.post("/zonas", response_model=CatalogoOut, status_code=201)
async def crear_zona(datos: CatalogoCreate, session: SessionDep, actor: ConfigUser) -> CatalogoOut:
    obj = await servicio.crear_catalogo(session, Zona, datos, "zona_alta", actor_id=actor.id)
    await session.commit()
    return CatalogoOut.model_validate(obj)


@router.get("/zonas", response_model=Pagina[CatalogoOut])
async def listar_zonas(
    session: SessionDep, _: CurrentUser,
    page: int = Query(1, ge=1), per_page: int = Query(100, ge=1, le=500),
) -> Pagina[CatalogoOut]:
    items = await servicio.listar_catalogo(session, Zona)
    return paginar([CatalogoOut.model_validate(x) for x in items], page, per_page)


@router.get("/zonas/{id}", response_model=CatalogoOut)
async def obtener_zona(id: uuid.UUID, session: SessionDep, _: CurrentUser) -> CatalogoOut:
    obj = await servicio.obtener_por_id(session, Zona, id)
    if obj is None:
        raise ErrorAPI("no_encontrado", "zona no encontrada", status=404)
    return CatalogoOut.model_validate(obj)


@router.patch("/zonas/{id}", response_model=CatalogoOut)
async def actualizar_zona(
    id: uuid.UUID, cambios: CatalogoUpdate, session: SessionDep, actor: ConfigUser
) -> CatalogoOut:
    obj = await servicio.obtener_por_id(session, Zona, id)
    if obj is None:
        raise ErrorAPI("no_encontrado", "zona no encontrada", status=404)
    obj = await servicio.actualizar_catalogo(session, obj, cambios, "zona_modificacion", actor_id=actor.id)
    await session.commit()
    return CatalogoOut.model_validate(obj)


# ---------- Sectores ----------
@router.post("/sectores", response_model=CatalogoOut, status_code=201)
async def crear_sector(datos: CatalogoCreate, session: SessionDep, actor: ConfigUser) -> CatalogoOut:
    obj = await servicio.crear_catalogo(session, Sector, datos, "sector_alta", actor_id=actor.id)
    await session.commit()
    return CatalogoOut.model_validate(obj)


@router.get("/sectores", response_model=Pagina[CatalogoOut])
async def listar_sectores(
    session: SessionDep, _: CurrentUser,
    page: int = Query(1, ge=1), per_page: int = Query(100, ge=1, le=500),
) -> Pagina[CatalogoOut]:
    items = await servicio.listar_catalogo(session, Sector)
    return paginar([CatalogoOut.model_validate(x) for x in items], page, per_page)


@router.get("/sectores/{id}", response_model=CatalogoOut)
async def obtener_sector(id: uuid.UUID, session: SessionDep, _: CurrentUser) -> CatalogoOut:
    obj = await servicio.obtener_por_id(session, Sector, id)
    if obj is None:
        raise ErrorAPI("no_encontrado", "sector no encontrado", status=404)
    return CatalogoOut.model_validate(obj)


@router.patch("/sectores/{id}", response_model=CatalogoOut)
async def actualizar_sector(
    id: uuid.UUID, cambios: CatalogoUpdate, session: SessionDep, actor: ConfigUser
) -> CatalogoOut:
    obj = await servicio.obtener_por_id(session, Sector, id)
    if obj is None:
        raise ErrorAPI("no_encontrado", "sector no encontrado", status=404)
    obj = await servicio.actualizar_catalogo(session, obj, cambios, "sector_modificacion", actor_id=actor.id)
    await session.commit()
    return CatalogoOut.model_validate(obj)


# ---------- Temas ----------
@router.post("/temas", response_model=CatalogoOut, status_code=201)
async def crear_tema(datos: CatalogoCreate, session: SessionDep, actor: ConfigUser) -> CatalogoOut:
    obj = await servicio.crear_catalogo(session, Tema, datos, "tema_alta", actor_id=actor.id)
    await session.commit()
    return CatalogoOut.model_validate(obj)


@router.get("/temas", response_model=Pagina[CatalogoOut])
async def listar_temas(
    session: SessionDep, _: CurrentUser,
    page: int = Query(1, ge=1), per_page: int = Query(100, ge=1, le=500),
) -> Pagina[CatalogoOut]:
    items = await servicio.listar_catalogo(session, Tema)
    return paginar([CatalogoOut.model_validate(x) for x in items], page, per_page)


@router.get("/temas/{id}", response_model=CatalogoOut)
async def obtener_tema(id: uuid.UUID, session: SessionDep, _: CurrentUser) -> CatalogoOut:
    obj = await servicio.obtener_por_id(session, Tema, id)
    if obj is None:
        raise ErrorAPI("no_encontrado", "tema no encontrado", status=404)
    return CatalogoOut.model_validate(obj)


@router.patch("/temas/{id}", response_model=CatalogoOut)
async def actualizar_tema(
    id: uuid.UUID, cambios: CatalogoUpdate, session: SessionDep, actor: ConfigUser
) -> CatalogoOut:
    obj = await servicio.obtener_por_id(session, Tema, id)
    if obj is None:
        raise ErrorAPI("no_encontrado", "tema no encontrado", status=404)
    obj = await servicio.actualizar_catalogo(session, obj, cambios, "tema_modificacion", actor_id=actor.id)
    await session.commit()
    return CatalogoOut.model_validate(obj)


# ---------- Canales ----------
@router.post("/canales", response_model=CatalogoOut, status_code=201)
async def crear_canal(datos: CatalogoCreate, session: SessionDep, actor: ConfigUser) -> CatalogoOut:
    obj = await servicio.crear_catalogo(session, Canal, datos, "canal_alta", actor_id=actor.id)
    await session.commit()
    return CatalogoOut.model_validate(obj)


@router.get("/canales", response_model=Pagina[CatalogoOut])
async def listar_canales(
    session: SessionDep, _: CurrentUser,
    page: int = Query(1, ge=1), per_page: int = Query(100, ge=1, le=500),
) -> Pagina[CatalogoOut]:
    items = await servicio.listar_catalogo(session, Canal)
    return paginar([CatalogoOut.model_validate(x) for x in items], page, per_page)


@router.get("/canales/{id}", response_model=CatalogoOut)
async def obtener_canal(id: uuid.UUID, session: SessionDep, _: CurrentUser) -> CatalogoOut:
    obj = await servicio.obtener_por_id(session, Canal, id)
    if obj is None:
        raise ErrorAPI("no_encontrado", "canal no encontrado", status=404)
    return CatalogoOut.model_validate(obj)


@router.patch("/canales/{id}", response_model=CatalogoOut)
async def actualizar_canal(
    id: uuid.UUID, cambios: CatalogoUpdate, session: SessionDep, actor: ConfigUser
) -> CatalogoOut:
    obj = await servicio.obtener_por_id(session, Canal, id)
    if obj is None:
        raise ErrorAPI("no_encontrado", "canal no encontrado", status=404)
    obj = await servicio.actualizar_catalogo(session, obj, cambios, "canal_modificacion", actor_id=actor.id)
    await session.commit()
    return CatalogoOut.model_validate(obj)


# ---------- Disposiciones ----------
@router.post("/disposiciones", response_model=DisposicionOut, status_code=201)
async def crear_disposicion(
    datos: DisposicionCreate, session: SessionDep, actor: ConfigUser
) -> DisposicionOut:
    obj = await servicio.crear_disposicion(session, datos, actor_id=actor.id)
    await session.commit()
    return DisposicionOut.model_validate(obj)


@router.get("/disposiciones", response_model=Pagina[DisposicionOut])
async def listar_disposiciones(
    session: SessionDep, _: CurrentUser,
    page: int = Query(1, ge=1), per_page: int = Query(100, ge=1, le=500),
) -> Pagina[DisposicionOut]:
    items = await servicio.listar_catalogo(session, Disposicion)
    return paginar([DisposicionOut.model_validate(x) for x in items], page, per_page)


@router.get("/disposiciones/{id}", response_model=DisposicionOut)
async def obtener_disposicion(id: uuid.UUID, session: SessionDep, _: CurrentUser) -> DisposicionOut:
    obj = await servicio.obtener_por_id(session, Disposicion, id)
    if obj is None:
        raise ErrorAPI("no_encontrado", "disposicion no encontrada", status=404)
    return DisposicionOut.model_validate(obj)


@router.patch("/disposiciones/{id}", response_model=DisposicionOut)
async def actualizar_disposicion(
    id: uuid.UUID, cambios: DisposicionUpdate, session: SessionDep, actor: ConfigUser
) -> DisposicionOut:
    obj = await servicio.obtener_por_id(session, Disposicion, id)
    if obj is None:
        raise ErrorAPI("no_encontrado", "disposicion no encontrada", status=404)
    obj = await servicio.actualizar_disposicion(session, obj, cambios, actor_id=actor.id)
    await session.commit()
    return DisposicionOut.model_validate(obj)


# ---------- Provincias ----------
@router.post("/provincias", response_model=ProvinciaOut, status_code=201)
async def crear_provincia(
    datos: ProvinciaCreate, session: SessionDep, actor: ConfigUser
) -> ProvinciaOut:
    obj = await servicio.crear_provincia(session, datos, actor_id=actor.id)
    await session.commit()
    return ProvinciaOut.model_validate(obj)


@router.get("/provincias", response_model=Pagina[ProvinciaOut])
async def listar_provincias(
    session: SessionDep, _: CurrentUser,
    page: int = Query(1, ge=1), per_page: int = Query(100, ge=1, le=500),
) -> Pagina[ProvinciaOut]:
    items = await servicio.listar_catalogo(session, Provincia)
    return paginar([ProvinciaOut.model_validate(x) for x in items], page, per_page)


@router.get("/provincias/{id}", response_model=ProvinciaOut)
async def obtener_provincia(id: uuid.UUID, session: SessionDep, _: CurrentUser) -> ProvinciaOut:
    obj = await servicio.obtener_por_id(session, Provincia, id)
    if obj is None:
        raise ErrorAPI("no_encontrado", "provincia no encontrada", status=404)
    return ProvinciaOut.model_validate(obj)


@router.patch("/provincias/{id}", response_model=ProvinciaOut)
async def actualizar_provincia(
    id: uuid.UUID, cambios: ProvinciaUpdate, session: SessionDep, actor: ConfigUser
) -> ProvinciaOut:
    obj = await servicio.obtener_por_id(session, Provincia, id)
    if obj is None:
        raise ErrorAPI("no_encontrado", "provincia no encontrada", status=404)
    obj = await servicio.actualizar_provincia(session, obj, cambios, actor_id=actor.id)
    await session.commit()
    return ProvinciaOut.model_validate(obj)


# ---------- Localidades ----------
@router.post("/localidades", response_model=LocalidadOut, status_code=201)
async def crear_localidad(
    datos: LocalidadCreate, session: SessionDep, actor: ConfigUser
) -> LocalidadOut:
    obj = await servicio.crear_localidad(session, datos, actor_id=actor.id)
    await session.commit()
    return LocalidadOut.model_validate(obj)


@router.get("/localidades", response_model=Pagina[LocalidadOut])
async def listar_localidades(
    session: SessionDep,
    _: CurrentUser,
    provincia_id: uuid.UUID | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(200, ge=1, le=1000),
) -> Pagina[LocalidadOut]:
    items = await servicio.listar_localidades(session, provincia_id=provincia_id)
    return paginar([LocalidadOut.model_validate(x) for x in items], page, per_page)


@router.get("/localidades/{id}", response_model=LocalidadOut)
async def obtener_localidad(id: uuid.UUID, session: SessionDep, _: CurrentUser) -> LocalidadOut:
    obj = await servicio.obtener_por_id(session, Localidad, id)
    if obj is None:
        raise ErrorAPI("no_encontrado", "localidad no encontrada", status=404)
    return LocalidadOut.model_validate(obj)


@router.patch("/localidades/{id}", response_model=LocalidadOut)
async def actualizar_localidad(
    id: uuid.UUID, cambios: LocalidadUpdate, session: SessionDep, actor: ConfigUser
) -> LocalidadOut:
    obj = await servicio.obtener_por_id(session, Localidad, id)
    if obj is None:
        raise ErrorAPI("no_encontrado", "localidad no encontrada", status=404)
    obj = await servicio.actualizar_localidad(session, obj, cambios, actor_id=actor.id)
    await session.commit()
    return LocalidadOut.model_validate(obj)


# ---------- Vendedores ----------
@router.get("/vendedores", response_model=list[VendedorConAsignacionOut])
async def listar_vendedores(
    session: SessionDep, _: ConfigUser
) -> list[VendedorConAsignacionOut]:
    return await servicio.listar_vendedores_con_asignacion(session)


@router.put("/vendedores/{vendedor_id}/asignacion", response_model=AsignacionVendedorOut, status_code=201)
async def asignar_vendedor(
    vendedor_id: uuid.UUID,
    datos: AsignacionVendedorIn,
    session: SessionDep,
    actor: ConfigUser,
) -> AsignacionVendedorOut:
    obj = await servicio.asignar_vendedor(session, vendedor_id, datos, actor_id=actor.id)
    await session.commit()
    return AsignacionVendedorOut.model_validate(obj)
