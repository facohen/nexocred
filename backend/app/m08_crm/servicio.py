import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auditoria import escribir_evento
from app.errors import ErrorAPI
from app.m06_novaciones.modelos import Novacion, NovacionOrigen
from app.m08_crm.modelos import AsignacionCrm, Interaccion, PromesaPago, Prospecto
from app.m08_crm.schemas import TimelineEvento
from app.modelos_stub import (
    Alerta,
    Cuota,
    Incidente,
    Pago,
    Prestamo,
    SolicitudCredito,
    Tarea,
)


# ---------- Tareas ----------
async def crear_tarea(
    session: AsyncSession,
    *,
    persona_id: uuid.UUID | None,
    prestamo_id: uuid.UUID | None = None,
    operador_id: uuid.UUID | None,
    titulo: str,
    descripcion: str | None = None,
    prioridad: str | None = None,
    vencimiento: date | None = None,
    origen: str = "manual",
    alerta_id: uuid.UUID | None = None,
    promesa_id: uuid.UUID | None = None,
    dedupe_key: str | None = None,
    actor_id: uuid.UUID | None,
    commit: bool = True,
) -> Tarea:
    # Idempotency guard: si hay dedupe_key + origen activos, devolver la existente.
    if dedupe_key is not None:
        res = await session.execute(
            select(Tarea).where(
                Tarea.dedupe_key == dedupe_key,
                Tarea.origen == origen,
                Tarea.estado == "pendiente",
            )
        )
        existente = res.scalar_one_or_none()
        if existente is not None:
            return existente

    tarea = Tarea(
        persona_id=persona_id,
        prestamo_id=prestamo_id,
        operador_id=operador_id,
        titulo=titulo,
        descripcion=descripcion,
        prioridad=prioridad,
        vencimiento=vencimiento,
        origen=origen,
        alerta_id=alerta_id,
        promesa_id=promesa_id,
        dedupe_key=dedupe_key,
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
    tema_id: uuid.UUID | None = None,
    canal_id: uuid.UUID | None = None,
    disposicion_id: uuid.UUID | None = None,
    credito_id: uuid.UUID | None = None,
    proximo_paso_fecha: date | None = None,
    proximo_paso_nota: str | None = None,
    actor_id: uuid.UUID | None,
    commit: bool = True,
) -> Interaccion:
    if tipo not in ("llamada", "visita", "mensaje", "nota"):
        raise ErrorAPI("tipo_invalido", f"tipo invalido: {tipo}", status=422)
    interaccion = Interaccion(
        persona_id=persona_id,
        operador_id=operador_id,
        tipo=tipo,
        tarea_id=tarea_id,
        detalle=detalle,
        tema_id=tema_id,
        canal_id=canal_id,
        disposicion_id=disposicion_id,
        credito_id=credito_id,
        proximo_paso_fecha=proximo_paso_fecha,
        proximo_paso_nota=proximo_paso_nota,
    )
    session.add(interaccion)
    await session.flush()
    await escribir_evento(
        session, actor_id=actor_id, accion="interaccion_alta", entidad="interaccion",
        entidad_id=interaccion.id, metadata_json={"tipo": tipo},
    )
    # Si hay próximo paso → crear tarea de seguimiento en la misma transacción.
    if proximo_paso_fecha is not None:
        await crear_tarea(
            session,
            persona_id=persona_id,
            operador_id=operador_id,
            titulo=proximo_paso_nota or "Seguimiento CRM",
            vencimiento=proximo_paso_fecha,
            origen="seguimiento_crm",
            dedupe_key=f"seguimiento_crm:{str(interaccion.id)}",
            actor_id=actor_id,
            commit=False,
        )
    if commit:
        await session.commit()
    return interaccion


async def interacciones_de(
    session: AsyncSession,
    persona_id: uuid.UUID,
    tema_id: uuid.UUID | None = None,
    disposicion_id: uuid.UUID | None = None,
) -> list[Interaccion]:
    stmt = (
        select(Interaccion)
        .where(Interaccion.persona_id == persona_id)
        .order_by(Interaccion.fecha)
    )
    if tema_id is not None:
        stmt = stmt.where(Interaccion.tema_id == tema_id)
    if disposicion_id is not None:
        stmt = stmt.where(Interaccion.disposicion_id == disposicion_id)
    res = await session.execute(stmt)
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
    await escribir_evento(
        session, actor_id=actor_id, accion="incidente_actualizar",
        entidad="incidente", entidad_id=incidente.id,
        metadata_json={"estado": estado, "severidad": severidad},
    )
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
    session: AsyncSession,
    persona_id: uuid.UUID,
    tema_id: uuid.UUID | None = None,
    disposicion_id: uuid.UUID | None = None,
) -> list[TimelineEvento]:
    eventos: list[TimelineEvento] = []

    # Interacciones CRM (con filtros opcionales de tema y disposicion)
    for i in await interacciones_de(session, persona_id, tema_id=tema_id, disposicion_id=disposicion_id):
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
        # Cancelaciones: prestamo cancelado de la persona.
        if p.estado == "cancelado":
            eventos.append(
                TimelineEvento(
                    tipo="cancelacion", fecha=p.created_at, detalle=p.estado,
                    referencia=str(p.id),
                )
            )
    prestamo_ids = [p.id for p in prestamos]
    # Novaciones que originan algun prestamo de la persona.
    if prestamo_ids:
        res = await session.execute(
            select(Novacion)
            .join(NovacionOrigen, NovacionOrigen.novacion_id == Novacion.id)
            .where(NovacionOrigen.prestamo_id.in_(prestamo_ids))
            .distinct()
        )
        for nov in res.scalars().all():
            eventos.append(
                TimelineEvento(
                    tipo="novacion", fecha=nov.created_at, detalle=nov.tipo,
                    referencia=str(nov.id),
                )
            )
    # Alertas de riesgo de la persona.
    res = await session.execute(
        select(Alerta).where(Alerta.persona_id == persona_id)
    )
    for al in res.scalars().all():
        eventos.append(
            TimelineEvento(
                tipo="alerta", fecha=al.created_at,
                detalle=al.metrica or al.tipo, referencia=str(al.id),
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


# ---------- Promesas de Pago ----------

async def crear_promesa(
    session: AsyncSession,
    *,
    prestamo_id: uuid.UUID,
    monto_prometido: Decimal,
    fecha_prometida: date,
    canal_origen: str,
    interaccion_id: uuid.UUID | None = None,
    parada_ruta_id: uuid.UUID | None = None,
    cuota_id: uuid.UUID | None = None,
    creada_por: uuid.UUID | None,
    actor_id: uuid.UUID | None,
    commit: bool = True,
) -> PromesaPago:
    from sqlalchemy import func as sqlfunc

    # Calcular saldo exigible como baseline (suma de cuotas pendientes/vencidas).
    res = await session.execute(
        select(sqlfunc.coalesce(sqlfunc.sum(Cuota.cuota), 0)).where(
            Cuota.prestamo_id == prestamo_id,
            Cuota.estado.in_(["pendiente", "vencida"]),
        )
    )
    saldo_base = res.scalar_one() or Decimal("0")

    promesa = PromesaPago(
        prestamo_id=prestamo_id,
        cuota_id=cuota_id,
        monto_prometido=monto_prometido,
        monto_exigible_base=saldo_base,
        fecha_prometida=fecha_prometida,
        canal_origen=canal_origen,
        interaccion_id=interaccion_id,
        parada_ruta_id=parada_ruta_id,
        creada_por=creada_por,
        estado="vigente",
    )
    session.add(promesa)
    await session.flush()
    await escribir_evento(
        session, actor_id=actor_id, accion="promesa_alta", entidad="promesa_pago",
        entidad_id=promesa.id,
        metadata_json={
            "prestamo_id": str(prestamo_id),
            "monto": str(monto_prometido),
            "fecha": str(fecha_prometida),
        },
    )
    if commit:
        await session.commit()
    return promesa


async def obtener_promesa(
    session: AsyncSession, promesa_id: uuid.UUID
) -> PromesaPago | None:
    res = await session.execute(
        select(PromesaPago).where(PromesaPago.id == promesa_id)
    )
    return res.scalar_one_or_none()


async def listar_promesas(
    session: AsyncSession,
    *,
    prestamo_id: uuid.UUID | None = None,
    estado: str | None = None,
) -> list[PromesaPago]:
    stmt = select(PromesaPago).order_by(PromesaPago.created_at.desc())
    if prestamo_id is not None:
        stmt = stmt.where(PromesaPago.prestamo_id == prestamo_id)
    if estado is not None:
        stmt = stmt.where(PromesaPago.estado == estado)
    res = await session.execute(stmt)
    return list(res.scalars().all())


async def reconciliar_promesas(
    session: AsyncSession,
    *,
    prestamo_id: uuid.UUID,
    actor_id: uuid.UUID | None,
    fecha_hoy: date | None = None,
) -> list[PromesaPago]:
    """Recalcula el estado de las promesas vigentes de un préstamo
    en función del saldo exigible actual (cuotas pendientes/vencidas).
    Promesa rota → crea tarea de seguimiento (idempotente por dedupe_key).
    """
    from datetime import date as _date

    hoy = fecha_hoy or _date.today()

    res = await session.execute(
        select(PromesaPago).where(
            PromesaPago.prestamo_id == prestamo_id,
            PromesaPago.estado == "vigente",
        )
    )
    promesas = list(res.scalars().all())
    if not promesas:
        return []

    from sqlalchemy import func as sqlfunc

    saldo_res = await session.execute(
        select(sqlfunc.coalesce(sqlfunc.sum(Cuota.cuota), 0)).where(
            Cuota.prestamo_id == prestamo_id,
            Cuota.estado.in_(["pendiente", "vencida"]),
        )
    )
    saldo_actual = saldo_res.scalar_one() or Decimal("0")

    # Obtener persona_id del prestamo.
    prestamo = await session.get(Prestamo, prestamo_id)
    persona_id = prestamo.persona_id if prestamo else None

    actualizadas = []
    for p in promesas:
        base = p.monto_exigible_base or Decimal("0")
        pagado = base - saldo_actual
        if saldo_actual <= 0:
            nuevo_estado = "cumplida"
        elif pagado >= p.monto_prometido:
            nuevo_estado = "cumplida"
        elif pagado > 0:
            nuevo_estado = "parcial"
        elif p.fecha_prometida < hoy:
            nuevo_estado = "rota"
        else:
            actualizadas.append(p)
            continue

        p.estado = nuevo_estado
        await session.flush()

        if nuevo_estado == "rota":
            await crear_tarea(
                session,
                persona_id=persona_id,
                operador_id=None,
                titulo=f"Promesa rota — préstamo {str(prestamo_id)[:8]}",
                descripcion=f"Prometido ${p.monto_prometido} para {p.fecha_prometida}",
                origen="promesa_rota",
                promesa_id=p.id,
                dedupe_key=f"promesa_rota:{str(p.id)}",
                actor_id=actor_id,
                commit=False,
            )
        actualizadas.append(p)

    return actualizadas


# ---------- Ficha Cliente 360 ----------

async def ficha_cliente_360(
    session: AsyncSession, persona_id: uuid.UUID
) -> dict:
    """Exposición consolidada a nivel persona: suma de capital pendiente,
    peor bucket de mora, promesas vigentes, y préstamos activos."""
    from sqlalchemy import func as sqlfunc
    from app.m07_riesgo.servicio import cartera_riesgo

    # Todos los préstamos vigentes/mora de la persona.
    res = await session.execute(
        select(Prestamo).where(
            Prestamo.persona_id == persona_id,
            Prestamo.estado.in_(["vigente", "en_mora"]),
        )
    )
    prestamos = list(res.scalars().all())

    exposicion_total = Decimal("0")
    peor_bucket = 0
    promesas_vigentes = 0
    prestamo_ids = [p.id for p in prestamos]

    if prestamo_ids:
        # Capital pendiente: suma de cuotas pendientes/vencidas
        cap_res = await session.execute(
            select(sqlfunc.coalesce(sqlfunc.sum(Cuota.cuota), 0)).where(
                Cuota.prestamo_id.in_(prestamo_ids),
                Cuota.estado.in_(["pendiente", "vencida"]),
            )
        )
        exposicion_total = cap_res.scalar_one() or Decimal("0")

        # Peor bucket (max dias de atraso via alerta metrica mora_*)
        # Simplificado: usamos prestamo.estado y la mayor mora por alertas activas.
        alertas_res = await session.execute(
            select(Alerta.metrica).where(
                Alerta.prestamo_id.in_(prestamo_ids),
                Alerta.estado == "activa",
                Alerta.metrica.like("mora_%"),
            )
        )
        for metrica in alertas_res.scalars().all():
            try:
                dias = int(metrica.replace("mora_", ""))
                if dias > peor_bucket:
                    peor_bucket = dias
            except ValueError:
                pass

        # Promesas vigentes del cliente
        prom_res = await session.execute(
            select(sqlfunc.count()).select_from(PromesaPago).where(
                PromesaPago.prestamo_id.in_(prestamo_ids),
                PromesaPago.estado == "vigente",
            )
        )
        promesas_vigentes = prom_res.scalar_one() or 0

    return {
        "persona_id": str(persona_id),
        "exposicion_total": str(exposicion_total),
        "peor_bucket_dias": peor_bucket,
        "prestamos_activos": len(prestamos),
        "promesas_vigentes": promesas_vigentes,
    }
