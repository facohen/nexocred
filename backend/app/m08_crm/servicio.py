import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auditoria import escribir_evento
from app.errors import ErrorAPI
from app.m08_crm.modelos import AsignacionCrm, Interaccion, Prospecto
from app.m08_crm.schemas import TimelineEvento
from app.modelos_stub import Incidente, Pago, Prestamo, SolicitudCredito, Tarea


# ---------- Tareas ----------
async def crear_tarea(
    session: AsyncSession,
    *,
    persona_id: uuid.UUID | None,
    operador_id: uuid.UUID | None,
    titulo: str,
    descripcion: str | None = None,
    prioridad: str | None = None,
    vencimiento: date | None = None,
    origen: str = "manual",
    alerta_id: uuid.UUID | None = None,
    actor_id: uuid.UUID | None,
    commit: bool = True,
) -> Tarea:
    tarea = Tarea(
        persona_id=persona_id,
        operador_id=operador_id,
        titulo=titulo,
        descripcion=descripcion,
        prioridad=prioridad,
        vencimiento=vencimiento,
        origen=origen,
        alerta_id=alerta_id,
        estado="pendiente",
    )
    session.add(tarea)
    await session.flush()
    await escribir_evento(
        session, actor_id=actor_id, accion="tarea_alta", entidad="tarea",
        entidad_id=tarea.id, metadata_json={"origen": origen},
    )
    if commit:
        await session.commit()
    return tarea


async def obtener_tarea(session: AsyncSession, tarea_id: uuid.UUID) -> Tarea | None:
    res = await session.execute(select(Tarea).where(Tarea.id == tarea_id))
    return res.scalar_one_or_none()


async def listar_tareas(
    session: AsyncSession,
    *,
    operador_id: uuid.UUID | None = None,
    persona_id: uuid.UUID | None = None,
    estado: str | None = None,
) -> list[Tarea]:
    stmt = select(Tarea).order_by(Tarea.created_at.desc())
    if operador_id is not None:
        stmt = stmt.where(Tarea.operador_id == operador_id)
    if persona_id is not None:
        stmt = stmt.where(Tarea.persona_id == persona_id)
    if estado is not None:
        stmt = stmt.where(Tarea.estado == estado)
    res = await session.execute(stmt)
    return list(res.scalars().all())


async def actualizar_tarea(
    session: AsyncSession,
    *,
    tarea: Tarea,
    estado: str | None,
    operador_id: uuid.UUID | None,
    prioridad: str | None,
    vencimiento: date | None,
    actor_id: uuid.UUID | None,
) -> Tarea:
    reasignada = operador_id is not None and operador_id != tarea.operador_id
    if estado is not None:
        tarea.estado = estado
    if operador_id is not None:
        tarea.operador_id = operador_id
    if prioridad is not None:
        tarea.prioridad = prioridad
    if vencimiento is not None:
        tarea.vencimiento = vencimiento
    await session.flush()
    if reasignada:
        await escribir_evento(
            session, actor_id=actor_id, accion="tarea_reasignacion", entidad="tarea",
            entidad_id=tarea.id, metadata_json={"operador_id": str(operador_id)},
        )
    await session.commit()
    return tarea


async def completar_tarea(
    session: AsyncSession,
    *,
    tarea: Tarea,
    tipo: str,
    detalle: str | None,
    actor_id: uuid.UUID | None,
) -> tuple[Tarea, Interaccion]:
    tarea.estado = "completada"
    interaccion = Interaccion(
        persona_id=tarea.persona_id,
        operador_id=tarea.operador_id or actor_id,
        tipo=tipo,
        tarea_id=tarea.id,
        detalle=detalle,
    )
    session.add(interaccion)
    await session.flush()
    await escribir_evento(
        session, actor_id=actor_id, accion="tarea_completar", entidad="tarea",
        entidad_id=tarea.id,
    )
    await session.commit()
    return tarea, interaccion


# ---------- Interacciones ----------
async def crear_interaccion(
    session: AsyncSession,
    *,
    persona_id: uuid.UUID,
    tipo: str,
    detalle: str | None,
    tarea_id: uuid.UUID | None,
    operador_id: uuid.UUID | None,
    actor_id: uuid.UUID | None,
) -> Interaccion:
    if tipo not in ("llamada", "visita", "mensaje", "nota"):
        raise ErrorAPI("tipo_invalido", f"tipo invalido: {tipo}", status=422)
    interaccion = Interaccion(
        persona_id=persona_id,
        operador_id=operador_id,
        tipo=tipo,
        tarea_id=tarea_id,
        detalle=detalle,
    )
    session.add(interaccion)
    await session.flush()
    await session.commit()
    return interaccion


async def interacciones_de(
    session: AsyncSession, persona_id: uuid.UUID
) -> list[Interaccion]:
    res = await session.execute(
        select(Interaccion)
        .where(Interaccion.persona_id == persona_id)
        .order_by(Interaccion.fecha)
    )
    return list(res.scalars().all())


# ---------- Incidentes ----------
async def crear_incidente(
    session: AsyncSession,
    *,
    persona_id: uuid.UUID | None,
    tipo: str | None,
    titulo: str | None,
    severidad: str | None,
    detalle: str | None,
    operador_id: uuid.UUID | None,
    actor_id: uuid.UUID | None,
) -> Incidente:
    incidente = Incidente(
        persona_id=persona_id,
        tipo=tipo,
        titulo=titulo,
        severidad=severidad,
        detalle=detalle,
        operador_id=operador_id,
        estado="abierto",
    )
    session.add(incidente)
    await session.flush()
    await escribir_evento(
        session, actor_id=actor_id, accion="incidente_alta", entidad="incidente",
        entidad_id=incidente.id,
    )
    await session.commit()
    return incidente


async def obtener_incidente(
    session: AsyncSession, incidente_id: uuid.UUID
) -> Incidente | None:
    res = await session.execute(select(Incidente).where(Incidente.id == incidente_id))
    return res.scalar_one_or_none()


async def listar_incidentes(
    session: AsyncSession,
    *,
    persona_id: uuid.UUID | None = None,
    estado: str | None = None,
) -> list[Incidente]:
    stmt = select(Incidente).order_by(Incidente.created_at.desc())
    if persona_id is not None:
        stmt = stmt.where(Incidente.persona_id == persona_id)
    if estado is not None:
        stmt = stmt.where(Incidente.estado == estado)
    res = await session.execute(stmt)
    return list(res.scalars().all())


async def actualizar_incidente(
    session: AsyncSession,
    *,
    incidente: Incidente,
    estado: str | None,
    severidad: str | None,
    operador_id: uuid.UUID | None,
    actor_id: uuid.UUID | None,
) -> Incidente:
    if estado is not None:
        incidente.estado = estado
    if severidad is not None:
        incidente.severidad = severidad
    if operador_id is not None:
        incidente.operador_id = operador_id
    await session.flush()
    await session.commit()
    return incidente


# ---------- Asignaciones ----------
async def asignar(
    session: AsyncSession,
    *,
    persona_id: uuid.UUID,
    operador_id: uuid.UUID,
    actor_id: uuid.UUID | None,
    commit: bool = True,
) -> AsignacionCrm:
    # Desactiva asignaciones previas activas de la persona.
    res = await session.execute(
        select(AsignacionCrm).where(
            AsignacionCrm.persona_id == persona_id, AsignacionCrm.activo.is_(True)
        )
    )
    for prev in res.scalars().all():
        prev.activo = False
    asignacion = AsignacionCrm(
        persona_id=persona_id, operador_id=operador_id, activo=True
    )
    session.add(asignacion)
    await session.flush()
    await escribir_evento(
        session, actor_id=actor_id, accion="crm_asignacion", entidad="asignacion_crm",
        entidad_id=asignacion.id,
        metadata_json={"persona_id": str(persona_id), "operador_id": str(operador_id)},
    )
    if commit:
        await session.commit()
    return asignacion


async def asignar_masivo(
    session: AsyncSession,
    *,
    persona_ids: list[uuid.UUID],
    operador_id: uuid.UUID,
    actor_id: uuid.UUID | None,
) -> list[AsignacionCrm]:
    asignaciones = []
    for pid in persona_ids:
        asignaciones.append(
            await asignar(
                session, persona_id=pid, operador_id=operador_id,
                actor_id=actor_id, commit=False,
            )
        )
    await session.commit()
    return asignaciones


# ---------- Timeline ----------
async def timeline(
    session: AsyncSession, persona_id: uuid.UUID
) -> list[TimelineEvento]:
    eventos: list[TimelineEvento] = []

    # Interacciones CRM
    for i in await interacciones_de(session, persona_id):
        eventos.append(
            TimelineEvento(
                tipo=f"interaccion:{i.tipo}", fecha=i.fecha, detalle=i.detalle,
                referencia=str(i.id),
            )
        )
    # Incidentes
    res = await session.execute(
        select(Incidente).where(Incidente.persona_id == persona_id)
    )
    for inc in res.scalars().all():
        eventos.append(
            TimelineEvento(
                tipo="incidente", fecha=inc.created_at, detalle=inc.titulo or inc.tipo,
                referencia=str(inc.id),
            )
        )
    # Eventos de credito: solicitudes
    res = await session.execute(
        select(SolicitudCredito).where(SolicitudCredito.persona_id == persona_id)
    )
    for s in res.scalars().all():
        eventos.append(
            TimelineEvento(
                tipo="solicitud", fecha=s.created_at, detalle=s.estado,
                referencia=str(s.id),
            )
        )
    # Desembolsos + pagos por prestamo
    res = await session.execute(
        select(Prestamo).where(Prestamo.persona_id == persona_id)
    )
    prestamos = list(res.scalars().all())
    for p in prestamos:
        eventos.append(
            TimelineEvento(
                tipo="desembolso", fecha=p.created_at,
                detalle=str(p.capital) if p.capital else None, referencia=str(p.id),
            )
        )
    if prestamos:
        res = await session.execute(
            select(Pago).where(
                Pago.prestamo_id.in_([p.id for p in prestamos]),
                Pago.estado == "aplicado",
            )
        )
        for pago in res.scalars().all():
            eventos.append(
                TimelineEvento(
                    tipo="pago", fecha=pago.created_at,
                    detalle=str(pago.monto) if pago.monto else None,
                    referencia=str(pago.id),
                )
            )

    eventos.sort(key=lambda e: e.fecha)
    return eventos


# ---------- Prospectos ----------
async def crear_prospecto(
    session: AsyncSession,
    *,
    nombre: str | None,
    telefono: str | None,
    operador_id: uuid.UUID | None,
    actor_id: uuid.UUID | None,
) -> Prospecto:
    prospecto = Prospecto(
        nombre=nombre, telefono=telefono, operador_id=operador_id, estado="nuevo"
    )
    session.add(prospecto)
    await session.flush()
    await session.commit()
    return prospecto


async def listar_prospectos(
    session: AsyncSession, *, estado: str | None = None
) -> list[Prospecto]:
    stmt = select(Prospecto).order_by(Prospecto.created_at.desc())
    if estado is not None:
        stmt = stmt.where(Prospecto.estado == estado)
    res = await session.execute(stmt)
    return list(res.scalars().all())


async def obtener_prospecto(
    session: AsyncSession, prospecto_id: uuid.UUID
) -> Prospecto | None:
    res = await session.execute(select(Prospecto).where(Prospecto.id == prospecto_id))
    return res.scalar_one_or_none()


_ESTADOS_PROSPECTO = {"nuevo", "contactado", "calificado", "convertido", "descartado"}


async def actualizar_prospecto(
    session: AsyncSession,
    *,
    prospecto: Prospecto,
    estado: str | None,
    nombre: str | None,
    telefono: str | None,
    persona_id: uuid.UUID | None,
    actor_id: uuid.UUID | None,
) -> Prospecto:
    if nombre is not None:
        prospecto.nombre = nombre
    if telefono is not None:
        prospecto.telefono = telefono
    if estado is not None:
        if estado not in _ESTADOS_PROSPECTO:
            raise ErrorAPI("estado_invalido", f"estado invalido: {estado}", status=422)
        if estado == "convertido":
            # Promocion a persona: en el POC se vincula una persona existente.
            if persona_id is None:
                raise ErrorAPI(
                    "persona_requerida",
                    "para convertir un prospecto se debe vincular una persona existente",
                    status=422,
                )
            prospecto.persona_id = persona_id
            await escribir_evento(
                session, actor_id=actor_id, accion="prospecto_conversion",
                entidad="prospecto", entidad_id=prospecto.id,
                metadata_json={"persona_id": str(persona_id)},
            )
        prospecto.estado = estado
    await session.flush()
    await session.commit()
    return prospecto


def _suma_segura(valores: list[Decimal]) -> Decimal:
    total = Decimal("0")
    for v in valores:
        total += v
    return total
