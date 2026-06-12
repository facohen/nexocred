"""Job barrer_workflows: corre el motor §7.2 sobre los prestamos en mora del dia.

Thin: para cada prestamo con dias_atraso > 0 a `fecha`, arma un contexto
`mora_dia_{dias}` (familia cobranza) y lo evalua con `workflows.motor.evaluar`.
El motor es idempotente por (regla_id, dedupe_key), de modo que el barrido puede
correr varias veces sin re-disparar la misma regla. Toma `fecha` explicita.
"""

import uuid
from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from app.logging_setup import log_job
from app.m07_riesgo.servicio import cartera_riesgo
from app.workflows.motor import Efecto, evaluar
from app.workflows.schemas import ContextoIn


async def barrer_workflows_job(
    session: AsyncSession, fecha: date, *, actor_id: uuid.UUID | None = None
) -> list[Efecto]:
    """Evalua las reglas de cobranza para cada prestamo en mora a `fecha`.

    Devuelve la lista plana de efectos producidos.
    """
    cartera = await cartera_riesgo(session, fecha)
    efectos: list[Efecto] = []
    for c in cartera:
        if c.dias_atraso <= 0:
            continue
        ctx = ContextoIn(
            disparador=f"mora_dia_{c.dias_atraso}",
            prestamo_id=uuid.UUID(c.prestamo_id),
            persona_id=uuid.UUID(c.cliente_id),
            familia="cobranza",
            datos={"dias_atraso": c.dias_atraso},
        )
        efectos.extend(await evaluar(session, ctx, actor_id=actor_id))
    disparados = sum(1 for e in efectos if e.resultado == "ok")
    log_job(
        "barrer_workflows", fecha=fecha.isoformat(),
        evaluados=len(cartera), disparados=disparados,
    )
    return efectos


from app.jobs.celery_app import celery_app  # noqa: E402


@celery_app.task(name="app.jobs.workflows_job.task_barrer_workflows")
def task_barrer_workflows(fecha_iso: str | None = None) -> None:  # pragma: no cover
    import asyncio

    from app.db import async_session_maker

    fecha = date.fromisoformat(fecha_iso) if fecha_iso else date.today()

    async def _run() -> None:
        async with async_session_maker() as session:
            await barrer_workflows_job(session, fecha)
            await session.commit()

    asyncio.run(_run())
