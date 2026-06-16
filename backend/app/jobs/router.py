"""Disparadores on-demand de jobs (admin) para demoabilidad sin worker Celery.

Cada endpoint corre la funcion de job sincronicamente en la request y commitea.
Toma `fecha_corte` explicita (nunca now() implicito para fechas de negocio).
"""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select

from app.deps import SessionDep, requiere_rol
from app.jobs.aging import recalcular_aging
from app.jobs.punitorios import devengar_punitorios
from app.jobs.snapshot import generar_snapshot
from app.m08_crm import servicio as crm_servicio
from app.m08_crm.modelos import PromesaPago
from app.m12_auth.modelos import Usuario

router = APIRouter(tags=["jobs"])

AdminUser = Annotated[Usuario, Depends(requiere_rol("admin_sistema"))]


class JobIn(BaseModel):
    fecha_corte: date


class SnapshotOut(BaseModel):
    fecha_corte: date
    prestamos_vigentes: int
    prestamos_en_mora: int
    colocacion_mes: str
    capital_disponible: str


class PunitoriosOut(BaseModel):
    fecha_corte: date
    cuotas_actualizadas: int


class AgingOut(BaseModel):
    fecha_corte: date
    buckets: dict[str, str]


@router.post("/torre/snapshot", response_model=SnapshotOut)
async def correr_snapshot(
    datos: JobIn, session: SessionDep, actor: AdminUser
) -> SnapshotOut:
    snap = await generar_snapshot(session, datos.fecha_corte, actor_id=actor.id)
    await session.commit()
    return SnapshotOut(
        fecha_corte=datos.fecha_corte,
        prestamos_vigentes=snap.prestamos_vigentes,
        prestamos_en_mora=snap.prestamos_en_mora,
        colocacion_mes=f"{snap.colocacion_mes:.2f}",
        capital_disponible=f"{snap.capital_disponible:.2f}",
    )


@router.post("/jobs/punitorios", response_model=PunitoriosOut)
async def correr_punitorios(
    datos: JobIn, session: SessionDep, actor: AdminUser
) -> PunitoriosOut:
    tocadas = await devengar_punitorios(session, datos.fecha_corte, actor_id=actor.id)
    await session.commit()
    return PunitoriosOut(fecha_corte=datos.fecha_corte, cuotas_actualizadas=tocadas)


@router.post("/jobs/aging", response_model=AgingOut)
async def correr_aging(
    datos: JobIn, session: SessionDep, actor: AdminUser
) -> AgingOut:
    buckets = await recalcular_aging(session, datos.fecha_corte, actor_id=actor.id)
    await session.commit()
    return AgingOut(
        fecha_corte=datos.fecha_corte, buckets={k: str(v) for k, v in buckets.items()}
    )


class ReconciliarPromesasOut(BaseModel):
    fecha_corte: date
    promesas_procesadas: int
    promesas_rotas: int


@router.post("/jobs/reconciliar-promesas", response_model=ReconciliarPromesasOut)
async def reconciliar_promesas(
    datos: JobIn, session: SessionDep, actor: AdminUser
) -> ReconciliarPromesasOut:
    """Recorre todas las promesas vigentes y actualiza su estado.

    Por cada préstamo con promesas vigentes llama a reconciliar_promesas del
    servicio CRM (que es idempotente: usa dedupe_key para no duplicar tareas).
    Cada préstamo se commitea individualmente para limitar el scope de errores.
    """
    res = await session.execute(
        select(PromesaPago.prestamo_id)
        .where(PromesaPago.estado == "vigente")
        .distinct()
    )
    prestamo_ids = list(res.scalars().all())

    total_procesadas = 0
    total_rotas = 0

    for prestamo_id in prestamo_ids:
        actualizadas = await crm_servicio.reconciliar_promesas(
            session,
            prestamo_id=prestamo_id,
            actor_id=actor.id,
            fecha_hoy=datos.fecha_corte,
        )
        await session.commit()
        total_procesadas += len(actualizadas)
        total_rotas += sum(1 for p in actualizadas if p.estado == "rota")

    return ReconciliarPromesasOut(
        fecha_corte=datos.fecha_corte,
        promesas_procesadas=total_procesadas,
        promesas_rotas=total_rotas,
    )
