import uuid

from sqlalchemy import func, or_, select, union
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auditoria import escribir_evento
from app.errors import ErrorAPI
from app.m01_personas.cuil import validar_cuil
from app.m01_personas.modelos import Persona, PersonaMarca, PersonaReferencia
from app.m16_maestros.modelos import Localidad
from app.modelos_stub import Prestamo, SolicitudCredito
from app.m01_personas.schemas import MarcaIn, PersonaCreate, ReferenciaIn


async def _validar_ubicacion(
    session: AsyncSession,
    provincia_id: uuid.UUID | None,
    localidad_id: uuid.UUID | None,
) -> None:
    if localidad_id is None or provincia_id is None:
        return
    res = await session.execute(
        select(Localidad.provincia_id).where(Localidad.id == localidad_id)
    )
    prov_real = res.scalar_one_or_none()
    if prov_real is None:
        raise ErrorAPI("localidad_inexistente", "localidad no encontrada", status=422)
    if prov_real != provincia_id:
        raise ErrorAPI(
            "localidad_provincia_mismatch",
            "la localidad no pertenece a la provincia indicada",
            status=422,
        )


async def crear_persona(
    session: AsyncSession, datos: PersonaCreate, *, actor_id: uuid.UUID | None
) -> Persona:
    if not validar_cuil(datos.cuil):
        raise ErrorAPI(
            "cuil_invalido", "el CUIL no supera la validacion de digito verificador",
            status=422,
        )
    existente = await session.execute(
        select(Persona.id).where(Persona.cuil == datos.cuil)
    )
    if existente.scalar_one_or_none() is not None:
        raise ErrorAPI("cuil_duplicado", "ya existe una persona con ese CUIL", status=409)

    await _validar_ubicacion(session, datos.provincia_id, datos.localidad_id)

    campos = datos.model_dump(exclude={"referencias"})
    persona = Persona(**campos)
    persona.referencias_rel = [
        PersonaReferencia(**r.model_dump()) for r in datos.referencias
    ]
    session.add(persona)
    await session.flush()
    await escribir_evento(
        session,
        actor_id=actor_id,
        accion="persona_alta",
        entidad="persona",
        entidad_id=persona.id,
        metadata_json={"cuil": datos.cuil},
    )
    return persona


async def obtener_persona(
    session: AsyncSession, persona_id: uuid.UUID
) -> Persona | None:
    res = await session.execute(
        select(Persona)
        .where(Persona.id == persona_id)
        .options(selectinload(Persona.referencias_rel))
    )
    return res.scalar_one_or_none()


async def actualizar_persona(
    session: AsyncSession,
    persona: Persona,
    cambios: dict,
    *,
    actor_id: uuid.UUID | None,
) -> Persona:
    # DNI y CUIL nunca se modifican.
    cambios.pop("dni", None)
    cambios.pop("cuil", None)
    await _validar_ubicacion(
        session, cambios.get("provincia_id"), cambios.get("localidad_id")
    )
    for k, v in cambios.items():
        setattr(persona, k, v)
    await session.flush()
    await escribir_evento(
        session,
        actor_id=actor_id,
        accion="persona_modificacion",
        entidad="persona",
        entidad_id=persona.id,
        metadata_json={"campos": sorted(cambios.keys())},
    )
    return persona


async def listar_personas(
    session: AsyncSession,
    *,
    nombre: str | None = None,
    dni: str | None = None,
    cuil: str | None = None,
    vendedor_id: uuid.UUID | None = None,
    page: int = 1,
    per_page: int = 50,
) -> tuple[list[Persona], int]:
    q = select(Persona)
    cq = select(func.count()).select_from(Persona)
    if cuil:
        q = q.where(Persona.cuil == cuil)
        cq = cq.where(Persona.cuil == cuil)
    if dni:
        q = q.where(Persona.dni == dni)
        cq = cq.where(Persona.dni == dni)
    if nombre:
        patron = f"%{nombre}%"
        cond = or_(Persona.apellido.ilike(patron), Persona.nombre.ilike(patron))
        q = q.where(cond)
        cq = cq.where(cond)
    if vendedor_id is not None:
        # La cartera del vendedor son las personas detrás de sus solicitudes o
        # préstamos (Persona no tiene vendedor_id). Subquery por unión de ambos.
        personas_del_vendedor = union(
            select(SolicitudCredito.persona_id).where(
                SolicitudCredito.vendedor_id == vendedor_id
            ),
            select(Prestamo.persona_id).where(Prestamo.vendedor_id == vendedor_id),
        ).subquery()
        cond_vendedor = Persona.id.in_(select(personas_del_vendedor.c[0]))
        q = q.where(cond_vendedor)
        cq = cq.where(cond_vendedor)
    total = (await session.execute(cq)).scalar_one()
    q = q.order_by(Persona.apellido, Persona.nombre).limit(per_page).offset(
        (page - 1) * per_page
    )
    res = await session.execute(q)
    return list(res.scalars().all()), total


async def buscar_personas(session: AsyncSession, q: str, limite: int = 20) -> list[Persona]:
    patron = f"%{q}%"
    consulta = (
        select(Persona)
        .where(
            or_(
                Persona.apellido.ilike(patron),
                Persona.nombre.ilike(patron),
                Persona.dni.ilike(patron),
                Persona.cuil.ilike(patron),
            )
        )
        .limit(limite)
    )
    res = await session.execute(consulta)
    return list(res.scalars().all())


async def agregar_referencia(
    session: AsyncSession,
    persona: Persona,
    datos: ReferenciaIn,
    *,
    actor_id: uuid.UUID | None,
) -> PersonaReferencia:
    ref = PersonaReferencia(persona_id=persona.id, **datos.model_dump())
    session.add(ref)
    await session.flush()
    await escribir_evento(
        session,
        actor_id=actor_id,
        accion="persona_modificacion",
        entidad="persona_referencia",
        entidad_id=persona.id,
    )
    return ref


async def eliminar_referencia(
    session: AsyncSession,
    persona_id: uuid.UUID,
    referencia_id: uuid.UUID,
    *,
    actor_id: uuid.UUID | None,
) -> None:
    res = await session.execute(
        select(PersonaReferencia).where(
            PersonaReferencia.id == referencia_id,
            PersonaReferencia.persona_id == persona_id,
        )
    )
    ref = res.scalar_one_or_none()
    if ref is None:
        raise ErrorAPI("referencia_inexistente", "referencia no encontrada", status=404)
    total = await session.execute(
        select(func.count())
        .select_from(PersonaReferencia)
        .where(PersonaReferencia.persona_id == persona_id)
    )
    if total.scalar_one() <= 1:
        raise ErrorAPI(
            "referencia_minima",
            "la persona debe conservar al menos una referencia",
            status=409,
        )
    await session.delete(ref)
    await escribir_evento(
        session,
        actor_id=actor_id,
        accion="persona_modificacion",
        entidad="persona_referencia",
        entidad_id=persona_id,
    )


async def agregar_marca(
    session: AsyncSession,
    persona: Persona,
    datos: MarcaIn,
    *,
    actor_id: uuid.UUID | None,
) -> PersonaMarca:
    marca = PersonaMarca(
        persona_id=persona.id, tipo=datos.tipo, motivo=datos.motivo, creada_por=actor_id
    )
    session.add(marca)
    await session.flush()
    await escribir_evento(
        session,
        actor_id=actor_id,
        accion="persona_modificacion",
        entidad="persona_marca",
        entidad_id=persona.id,
        metadata_json={"tipo": datos.tipo},
    )
    return marca


async def listar_marcas(
    session: AsyncSession, persona_id: uuid.UUID
) -> list[PersonaMarca]:
    res = await session.execute(
        select(PersonaMarca).where(PersonaMarca.persona_id == persona_id)
    )
    return list(res.scalars().all())


async def listar_referencias(
    session: AsyncSession, persona_id: uuid.UUID
) -> list[PersonaReferencia]:
    res = await session.execute(
        select(PersonaReferencia).where(PersonaReferencia.persona_id == persona_id)
    )
    return list(res.scalars().all())
