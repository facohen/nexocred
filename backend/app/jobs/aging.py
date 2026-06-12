"""Job recalcular_aging: recomputa los buckets de mora por cartera a fecha_corte.

Reusa la cartera de riesgo (capital pendiente + dias de atraso) y la funcion pura
`aging` de M07. Idempotente (solo lee + computa). Audita el resultado.
"""

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.auditoria import escribir_evento
from app.m07_riesgo.metricas import aging
from app.m07_riesgo.servicio import cartera_riesgo


async def recalcular_aging(
    session: AsyncSession, fecha_corte: date, *, actor_id: uuid.UUID | None
) -> dict[str, Decimal]:
    cartera = await cartera_riesgo(session, fecha_corte)
    buckets = aging(cartera)
    await escribir_evento(
        session, actor_id=actor_id, accion="aging_recalculado",
        entidad="snapshot_cartera", entidad_id=None,
        metadata_json={
            "fecha_corte": fecha_corte.isoformat(),
            "buckets": {k: str(v) for k, v in buckets.items()},
        },
    )
    return buckets


def task_recalcular_aging(fecha_corte_iso: str) -> None:  # pragma: no cover
    import asyncio

    from app.db import async_session_maker

    async def _run() -> None:
        async with async_session_maker() as session:
            await recalcular_aging(
                session, date.fromisoformat(fecha_corte_iso), actor_id=None
            )
            await session.commit()

    asyncio.run(_run())
