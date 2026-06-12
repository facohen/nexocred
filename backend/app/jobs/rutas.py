"""Job generar_rutas: genera la ruta diaria de cada cobrador activo a `fecha`.

Thin: reusa `m05_ruta.servicio.generar_ruta` (que arma las paradas de los prestamos
con saldo exigible > 0). Idempotente a nivel de demo por la unique de ruta
(cobrador_id, fecha) si existiera; aqui generamos una ruta por cobrador activo que
aun no tenga ruta para esa fecha. Toma `fecha` explicita (nunca today()).
"""

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.m05_ruta.servicio import generar_ruta
from app.m12_auth.modelos import Rol, Usuario
from app.modelos_stub import RutaDiaria


async def _cobradores_activos(session: AsyncSession) -> list[Usuario]:
    res = await session.execute(
        select(Usuario)
        .join(Usuario.roles)
        .where(Usuario.activo.is_(True), Rol.nombre == "cobrador")
    )
    return list(res.unique().scalars().all())


async def generar_rutas_job(
    session: AsyncSession, fecha: date, *, actor_id: uuid.UUID | None = None
) -> int:
    """Genera una ruta para cada cobrador activo sin ruta en `fecha`.

    Devuelve la cantidad de rutas creadas.
    """
    cobradores = await _cobradores_activos(session)
    creadas = 0
    for cob in cobradores:
        existente = await session.execute(
            select(RutaDiaria.id).where(
                RutaDiaria.cobrador_id == cob.id, RutaDiaria.fecha == fecha
            )
        )
        if existente.scalar_one_or_none() is not None:
            continue
        await generar_ruta(session, cobrador_id=cob.id, fecha=fecha, actor_id=actor_id)
        creadas += 1
    return creadas


from app.jobs.celery_app import celery_app  # noqa: E402


@celery_app.task(name="app.jobs.rutas.task_generar_rutas")
def task_generar_rutas(fecha_iso: str | None = None) -> None:  # pragma: no cover
    import asyncio

    from app.db import async_session_maker

    fecha = date.fromisoformat(fecha_iso) if fecha_iso else date.today()

    async def _run() -> None:
        async with async_session_maker() as session:
            await generar_rutas_job(session, fecha)
            await session.commit()

    asyncio.run(_run())
