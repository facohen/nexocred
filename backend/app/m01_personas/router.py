import uuid

from fastapi import APIRouter, Query

from app.deps import OriginaSolicitud, CurrentUser, SessionDep, scope_vendedor
from app.errors import ErrorAPI
from app.m01_personas import servicio
from app.m01_personas.modelos import Persona
from app.m01_personas.schemas import (
    MarcaIn,
    MarcaOut,
    PersonaCreate,
    PersonaListItem,
    PersonaOut,
    PersonaPagina,
    PersonaUpdate,
    ReferenciaIn,
    ReferenciaOut,
)

router = APIRouter(prefix="/personas", tags=["personas"])


def _persona_out(p: Persona) -> PersonaOut:
    out = PersonaOut.model_validate(p)
    out.referencias = [ReferenciaOut.model_validate(r) for r in p.referencias_rel]
    if p.provincia_rel is not None:
        out.provincia_nombre = p.provincia_rel.nombre
    if p.localidad_rel is not None:
        out.localidad_nombre = p.localidad_rel.nombre
    return out


@router.post("", response_model=PersonaOut, status_code=201)
async def crear_persona(
    datos: PersonaCreate, session: SessionDep, actor: OriginaSolicitud
) -> PersonaOut:
    persona = await servicio.crear_persona(session, datos, actor_id=actor.id)
    await session.commit()
    persona = await servicio.obtener_persona(session, persona.id)
    if persona is None:
        raise ErrorAPI("persona_inexistente", "persona no encontrada tras alta", status=500)
    return _persona_out(persona)


@router.get("", response_model=PersonaPagina)
async def listar_personas(
    session: SessionDep,
    actor: CurrentUser,
    nombre: str | None = None,
    dni: str | None = None,
    cuil: str | None = None,
    vendedor_id: uuid.UUID | None = Query(default=None),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
) -> PersonaPagina:
    # Scope por vendedor: un vendedor puro solo ve su cartera de clientes; los
    # roles de lectura global ven todo o filtran libremente vía ?vendedor_id.
    filtro_vendedor = scope_vendedor(actor, vendedor_id)
    personas, total = await servicio.listar_personas(
        session, nombre=nombre, dni=dni, cuil=cuil,
        vendedor_id=filtro_vendedor, page=page, per_page=per_page,
    )
    return PersonaPagina(
        data=[PersonaListItem.model_validate(p) for p in personas],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/buscar", response_model=list[PersonaListItem])
async def buscar_personas(
    session: SessionDep, _: CurrentUser, q: str = Query(min_length=1)
) -> list[PersonaListItem]:
    personas = await servicio.buscar_personas(session, q)
    return [PersonaListItem.model_validate(p) for p in personas]


@router.get("/{persona_id}", response_model=PersonaOut)
async def ficha_persona(
    persona_id: uuid.UUID, session: SessionDep, _: CurrentUser
) -> PersonaOut:
    persona = await servicio.obtener_persona(session, persona_id)
    if persona is None:
        raise ErrorAPI("persona_inexistente", "persona no encontrada", status=404)
    return _persona_out(persona)


@router.patch("/{persona_id}", response_model=PersonaOut)
async def actualizar_persona(
    persona_id: uuid.UUID,
    datos: PersonaUpdate,
    session: SessionDep,
    actor: OriginaSolicitud,
) -> PersonaOut:
    persona = await servicio.obtener_persona(session, persona_id)
    if persona is None:
        raise ErrorAPI("persona_inexistente", "persona no encontrada", status=404)
    cambios = datos.model_dump(exclude_unset=True, exclude_none=True)
    await servicio.actualizar_persona(session, persona, cambios, actor_id=actor.id)
    await session.commit()
    persona = await servicio.obtener_persona(session, persona_id)
    if persona is None:
        raise ErrorAPI("persona_inexistente", "persona no encontrada tras actualización", status=500)
    return _persona_out(persona)


# ---------- referencias ----------
@router.post(
    "/{persona_id}/referencias", response_model=ReferenciaOut, status_code=201
)
async def agregar_referencia(
    persona_id: uuid.UUID,
    datos: ReferenciaIn,
    session: SessionDep,
    actor: OriginaSolicitud,
) -> ReferenciaOut:
    persona = await servicio.obtener_persona(session, persona_id)
    if persona is None:
        raise ErrorAPI("persona_inexistente", "persona no encontrada", status=404)
    ref = await servicio.agregar_referencia(session, persona, datos, actor_id=actor.id)
    await session.commit()
    return ReferenciaOut.model_validate(ref)


@router.get("/{persona_id}/referencias", response_model=list[ReferenciaOut])
async def listar_referencias(
    persona_id: uuid.UUID, session: SessionDep, _: CurrentUser
) -> list[ReferenciaOut]:
    refs = await servicio.listar_referencias(session, persona_id)
    return [ReferenciaOut.model_validate(r) for r in refs]


@router.delete("/{persona_id}/referencias/{ref_id}")
async def eliminar_referencia(
    persona_id: uuid.UUID,
    ref_id: uuid.UUID,
    session: SessionDep,
    actor: OriginaSolicitud,
) -> dict[str, str]:
    await servicio.eliminar_referencia(
        session, persona_id, ref_id, actor_id=actor.id
    )
    await session.commit()
    return {"estado": "eliminada"}


# ---------- marcas ----------
@router.post("/{persona_id}/marcas", response_model=MarcaOut, status_code=201)
async def agregar_marca(
    persona_id: uuid.UUID,
    datos: MarcaIn,
    session: SessionDep,
    actor: OriginaSolicitud,
) -> MarcaOut:
    persona = await servicio.obtener_persona(session, persona_id)
    if persona is None:
        raise ErrorAPI("persona_inexistente", "persona no encontrada", status=404)
    marca = await servicio.agregar_marca(session, persona, datos, actor_id=actor.id)
    await session.commit()
    return MarcaOut.model_validate(marca)


@router.get("/{persona_id}/marcas", response_model=list[MarcaOut])
async def listar_marcas(
    persona_id: uuid.UUID, session: SessionDep, _: CurrentUser
) -> list[MarcaOut]:
    marcas = await servicio.listar_marcas(session, persona_id)
    return [MarcaOut.model_validate(m) for m in marcas]
