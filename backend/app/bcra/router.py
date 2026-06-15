import uuid

from fastapi import APIRouter

from app.bcra import servicio
from app.deps import OriginaSolicitud, CurrentUser, SessionDep
from app.m01_personas.schemas import DeudaBcraOut

# Dos superficies para BCRA (spec §3): bajo /personas y bajo /bcra.
router_personas = APIRouter(prefix="/personas", tags=["bcra"])
router_bcra = APIRouter(prefix="/bcra", tags=["bcra"])


@router_personas.post("/{persona_id}/deuda-bcra/sync", response_model=list[DeudaBcraOut])
async def sync_deuda_bcra(
    persona_id: uuid.UUID, session: SessionDep, actor: OriginaSolicitud
) -> list[DeudaBcraOut]:
    cliente = servicio.obtener_cliente_bcra()
    filas = await servicio.sincronizar_bcra(
        session, persona_id, cliente, actor_id=actor.id
    )
    await session.commit()
    return [DeudaBcraOut.model_validate(f) for f in filas]


@router_personas.get("/{persona_id}/deuda-bcra", response_model=list[DeudaBcraOut])
async def historial_deuda_bcra(
    persona_id: uuid.UUID, session: SessionDep, _: CurrentUser
) -> list[DeudaBcraOut]:
    filas = await servicio.listar_deuda_bcra(session, persona_id)
    return [DeudaBcraOut.model_validate(f) for f in filas]


@router_bcra.post("/consultar/{persona_id}", response_model=list[DeudaBcraOut])
async def consultar_bcra(
    persona_id: uuid.UUID, session: SessionDep, actor: OriginaSolicitud
) -> list[DeudaBcraOut]:
    cliente = servicio.obtener_cliente_bcra()
    filas = await servicio.sincronizar_bcra(
        session, persona_id, cliente, actor_id=actor.id
    )
    await session.commit()
    return [DeudaBcraOut.model_validate(f) for f in filas]


@router_bcra.get("/{persona_id}/historial", response_model=list[DeudaBcraOut])
async def historial_bcra(
    persona_id: uuid.UUID, session: SessionDep, _: CurrentUser
) -> list[DeudaBcraOut]:
    filas = await servicio.listar_deuda_bcra(session, persona_id)
    return [DeudaBcraOut.model_validate(f) for f in filas]
