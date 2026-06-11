import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auditoria import escribir_evento
from app.bcra.puerto import BcraClient
from app.config import configuracion
from app.errors import ErrorAPI
from app.m01_personas.modelos import Persona, PersonaDeudaBcra


def obtener_cliente_bcra() -> BcraClient:
    """Selecciona el adaptador BCRA segun el ambiente.

    En local/test se usa el FakeBcraClient deterministico; en produccion el HTTP."""
    if configuracion.ambiente in ("local", "test"):
        from app.bcra.fake import FakeBcraClient

        return FakeBcraClient()
    from app.bcra.http import HttpBcraClient

    return HttpBcraClient()


async def sincronizar_bcra(
    session: AsyncSession,
    persona_id: uuid.UUID,
    cliente: BcraClient,
    *,
    actor_id: uuid.UUID | None,
) -> list[PersonaDeudaBcra]:
    res = await session.execute(select(Persona).where(Persona.id == persona_id))
    persona = res.scalar_one_or_none()
    if persona is None:
        raise ErrorAPI("persona_inexistente", "persona no encontrada", status=404)

    deudas = await cliente.consultar(persona.cuil)
    filas: list[PersonaDeudaBcra] = []
    for d in deudas:
        fila = PersonaDeudaBcra(
            persona_id=persona.id,
            entidad=d.entidad,
            monto=d.monto,
            situacion=d.situacion,
            fecha_informe=d.fecha_informe,
            fuente="api_bcra",
        )
        session.add(fila)
        filas.append(fila)
    await session.flush()
    await escribir_evento(
        session,
        actor_id=actor_id,
        accion="bcra_sync",
        entidad="persona",
        entidad_id=persona.id,
        metadata_json={"deudas_registradas": len(filas)},
    )
    return filas


async def listar_deuda_bcra(
    session: AsyncSession, persona_id: uuid.UUID
) -> list[PersonaDeudaBcra]:
    res = await session.execute(
        select(PersonaDeudaBcra)
        .where(PersonaDeudaBcra.persona_id == persona_id)
        .order_by(PersonaDeudaBcra.fecha_informe.desc())
    )
    return list(res.scalars().all())
