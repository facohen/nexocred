"""Siembra COMPLETA y determinista para demo de NexoCred.

Construye un portafolio rico de 6 meses a traves de la capa de servicios
(todas las invariantes de dominio se respetan: Decimal, snapshots inmutables,
cronogramas materializados, conservacion de caja).

Cubre:
- 50 personas argentinas verosímiles con BCRA reciente
- 3 perfiles de pricing con distintas tasas (28% / 32% / 38%)
- ~35 prestamos con ciclos de vida completos:
    * Lote A: cancelados en su totalidad via m03_prestamos.cancelar()
    * Lote B: vigentes con pagos puntuales cuota a cuota
    * Lote C: morosos sin ningun pago (primera cuota >30 dias vencida)
    * Lote D: novados (refinanciacion + consolidacion, mismo deudor)
    * Lote E: mix — pagos a cuenta (excedente), pagos parciales, cancelacion anticipada
- Interacciones CRM coherentes con cada ciclo de vida
- Promesas de pago: vigentes + rotas + cumplidas
- Catálogos m16: zonas, sectores, temas, canales, disposiciones
- Historial de asignaciones de vendedor (3 períodos de zona/sector)
- Múltiples aportes de tesorería de distintos inversores
- Personas con múltiples créditos (recurrentes, fiel con historial limpio)
- Espectro temporal completo: desde ene-2026 hasta jun-2026
- Prospectos CRM con distintos estados

Idempotente y crash-safe: el marcador MARCADOR_COMPLETO se escribe ULTIMO.
Fechas deterministas: todo se ancla en FECHA_ANCLA (nunca today()).

Uso:
    cd backend && conda run -n nexocred python -m scripts.seed_full
    cd backend && conda run -n nexocred python -m scripts.seed_full --reset
"""

import asyncio
import sys
import uuid
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.bcra.fake import FakeBcraClient
from app.bcra.puerto import DeudaBcraNormalizada
from app.bcra.servicio import sincronizar_bcra
from app.idempotencia import IdempotencyKey
from app.jobs.snapshot import generar_snapshot
from app.m01_personas.cuil import calcular_digito_verificador
from app.m01_personas.modelos import Persona, PersonaDeudaBcra
from app.m01_personas.schemas import PersonaCreate, ReferenciaIn
from app.m01_personas.servicio import crear_persona
from app.m02_originacion import servicio as orig
from app.m02_originacion.servicio_desembolso import desembolsar
from app.m03_prestamos import servicio as prest
from app.m04_caja.modelos import Caja
from app.m04_caja.servicio import crear_caja
from app.m04_pagos.servicio import registrar_pago
from app.m05_ruta.servicio import (
    cambiar_estado_rendicion,
    generar_rendicion,
    generar_ruta,
    obtener_parada,
    obtener_rendicion,
    obtener_ruta,
    paradas_de_ruta,
    visitar,
)
from app.m06_novaciones import servicio as nov
from app.m07_riesgo.alarmas import procesar as procesar_alarmas
from app.m08_crm.modelos import Interaccion, PromesaPago, Prospecto
from app.m08_crm.servicio import crear_incidente, crear_interaccion, crear_tarea
from app.m09_comisiones.modelos import ComisionLiquidacion
from app.m09_comisiones.servicio import (
    aprobar_liquidacion,
    devengar_por_desembolso,
    generar_liquidacion,
    pagar_liquidacion,
)
from app.m10_tesoreria.schemas import AporteRetiroIn
from app.m10_tesoreria.servicio import registrar_aporte
from app.m12_auth.modelos import Rol, Usuario
from app.m12_auth.servicio import crear_usuario
from app.m13_documentos import servicio as docs
from app.m15_catalogo import servicio as cat
from app.m15_catalogo.modelos import PerfilPricing, ProductoCredito
from app.m15_catalogo.schemas import (
    CeldaComisionIn,
    CeldaTasaIn,
    ProductoCreate,
)
from app.m16_maestros.modelos import (
    AsignacionVendedor,
    Canal,
    Disposicion,
    Sector,
    Tema,
    Zona,
)
from app.modelos_stub import Prestamo, RutaDiaria, SolicitudCredito

# ---------------------------------------------------------------------------
# Anclas deterministas
# ---------------------------------------------------------------------------
FECHA_ANCLA = date(2026, 6, 1)
FECHA_INICIO = date(2026, 1, 1)
SEMILLA = 99
N_PERSONAS = 50
PLAZOS = (3, 6, 12)
ROLES = ("admin_sistema", "analista_riesgo", "administrativo", "vendedor", "ceo")

MARCADOR_COMPLETO = "seed_full_completo"
_OP_MARCADOR = "seed_full"

# ---------------------------------------------------------------------------
# Datos para personas argentinas verosímiles
# ---------------------------------------------------------------------------
_NOMBRES_M = [
    "Martín", "Santiago", "Rodrigo", "Facundo", "Nicolás",
    "Leandro", "Diego", "Federico", "Gustavo", "Carlos",
    "Pablo", "Sebastián", "Matías", "Alejandro", "Javier",
    "Hernán", "Ezequiel", "Claudio", "Marcos", "Roberto",
]
_NOMBRES_F = [
    "Lucía", "Valentina", "Florencia", "Camila", "Natalia",
    "Paola", "Silvana", "Verónica", "Carolina", "Mónica",
    "Romina", "Marcela", "Laura", "Daniela", "Sofía",
    "Ana", "Cecilia", "Karina", "Gisela", "Adriana",
]
_APELLIDOS = [
    "González", "Rodríguez", "Fernández", "López", "Martínez",
    "García", "Pérez", "Sánchez", "Romero", "Torres",
    "Díaz", "Álvarez", "Ruiz", "Flores", "Acosta",
    "Benítez", "Medina", "Molina", "Moreno", "Herrera",
    "Castro", "Ramos", "Ortiz", "Vega", "Mendoza",
    "Silva", "Vargas", "Cabrera", "Gómez", "Muñoz",
]
_CALLES = [
    "Av. Corrientes", "Av. Santa Fe", "Av. Rivadavia", "Boyacá", "Av. Cabildo",
    "Álvarez Thomas", "Laprida", "Scalabrini Ortiz", "Thames", "Av. Boedo",
    "Gascón", "Av. Juan B. Justo", "Av. Avellaneda", "Uriburu", "Viamonte",
]
_LOCALIDADES_DOM = [
    "CABA", "Palermo", "Belgrano", "Caballito", "Villa del Parque",
    "Flores", "Lanús", "Lomas de Zamora", "Morón", "Quilmes",
    "San Martín", "Avellaneda", "Vicente López", "San Isidro", "Tigre",
    "Tres de Febrero",
]
_PROVINCIA_MAP = {
    "CABA": "Ciudad Autónoma de Buenos Aires",
    "Palermo": "Ciudad Autónoma de Buenos Aires",
    "Belgrano": "Ciudad Autónoma de Buenos Aires",
    "Caballito": "Ciudad Autónoma de Buenos Aires",
    "Villa del Parque": "Ciudad Autónoma de Buenos Aires",
    "Flores": "Ciudad Autónoma de Buenos Aires",
    "Lanús": "Buenos Aires", "Lomas de Zamora": "Buenos Aires",
    "Morón": "Buenos Aires", "Quilmes": "Buenos Aires",
    "San Martín": "Buenos Aires", "Avellaneda": "Buenos Aires",
    "Vicente López": "Buenos Aires", "San Isidro": "Buenos Aires",
    "Tigre": "Buenos Aires", "Tres de Febrero": "Buenos Aires",
}
_EMPLEADORES = [
    "Molino Cañuelas S.A.", "Mercado Libre", "YPF S.A.", "Banco Galicia",
    "Coto CICSA", "Carrefour Argentina", "Telecom Argentina", "OSDE",
    "Grupo Supervielle", "La Anónima", "Arcor S.A.", "Ford Argentina",
    "Farmacity", "Rapipago", "Edesur",
]
_VINCULOS = ["conyuge", "madre", "padre", "hermano", "amigo", "vecino"]

# ---------------------------------------------------------------------------
# Catálogos m16
# ---------------------------------------------------------------------------
_ZONAS_CFG = [
    ("norte",    "Zona Norte GBA"),
    ("oeste",    "Zona Oeste GBA"),
    ("sur",      "Zona Sur GBA"),
    ("caba",     "CABA"),
    ("interior", "Interior"),
]
_SECTORES_CFG = [
    ("call_center", "Call Center"),
    ("presencial",  "Presencial"),
    ("web",         "Web / Digital"),
]
_TEMAS_CFG = [
    ("pago",           "Pago de cuota"),
    ("refinanciacion", "Refinanciación"),
    ("consulta",       "Consulta general"),
    ("reclamo",        "Reclamo"),
    ("mora",           "Gestión de mora"),
]
_CANALES_CFG = [
    ("telefono",   "Teléfono"),
    ("whatsapp",   "WhatsApp"),
    ("presencial", "Presencial"),
    ("email",      "Email"),
]
_DISPOSICIONES_CFG = [
    ("pago_total",     "Pago total",           True),
    ("pago_parcial",   "Pago parcial",          True),
    ("promesa_pago",   "Promesa de pago",        False),
    ("no_contesta",    "No contesta",            False),
    ("numero_errado",  "Número errado",          False),
    ("se_niega",       "Se niega a pagar",       False),
    ("ya_pago",        "Ya pagó / sin deuda",    False),
    ("disputa",        "Disputa el monto",       False),
    ("acuerdo_cuotas", "Acordó plan de cuotas",  False),
]

# ---------------------------------------------------------------------------
# Aportes de tesorería: capital inicial + 2 inversores adicionales
# ---------------------------------------------------------------------------
_APORTES = [
    (FECHA_INICIO,                       Decimal("20000000"), "Inversores Fundadores", "Capital inicial"),
    (FECHA_INICIO + timedelta(days=45),  Decimal("8000000"),  "Inversor Ángel 1",      "Ampliación serie A"),
    (FECHA_INICIO + timedelta(days=90),  Decimal("5000000"),  "Inversor Ángel 2",      "Refuerzo de caja Q2"),
]

# ---------------------------------------------------------------------------
# Lotes de prestamo
#
# Cada entrada: (p_idx, monto, cuotas, delta_des_dias, offset_pc_dias, lote_tag)
# delta_des_dias: dias desde FECHA_INICIO hasta el desembolso
# offset_pc_dias: dias desde el desembolso hasta la primera cuota
#   positivo -> futura; negativo -> ya vencida (moroso — el abs es el atraso)
#
# Personas con múltiples créditos:
#   p_idx=0: cancelar (slot 0) + vigente reciente (slot 30) — cliente recurrente
#   p_idx=1: cancelar (slot 1) + vigente (slot 6)           — cliente recurrente
#   p_idx=3: pagado (slot 3) + pagado2 (slot 32) + vigente (slot 33) — fiel historial limpio
# ---------------------------------------------------------------------------
_LOTES: list[tuple[int, Decimal, int, int, int, str]] = [
    # ---- Lote A: cancelados ----
    (0,  Decimal("80000.00"),   3,   0,  30, "cancelar"),
    (1,  Decimal("120000.00"),  6,   5,  30, "cancelar"),
    (2,  Decimal("60000.00"),   3,  10,  30, "cancelar"),
    # ---- Lote B: pagados cuota a cuota ----
    (3,  Decimal("200000.00"),  3,  15,  30, "pagado"),
    (4,  Decimal("150000.00"),  3,  20,  30, "pagado"),
    (5,  Decimal("90000.00"),   3,  25,  30, "pagado"),
    # ---- Lote C: vigentes con pagos puntuales ----
    (1,  Decimal("180000.00"), 12,  90,  30, "vigente"),   # p_idx=1 2º crédito
    (7,  Decimal("75000.00"),   6,  95,  30, "vigente"),
    (8,  Decimal("110000.00"),  6, 100,  30, "vigente"),
    (9,  Decimal("250000.00"), 12, 105,  30, "vigente"),
    (10, Decimal("130000.00"),  6, 110,  30, "vigente"),
    (11, Decimal("95000.00"),   6, 115,  30, "vigente"),
    (12, Decimal("70000.00"),   3, 120,  30, "vigente"),
    (13, Decimal("160000.00"), 12, 125,  30, "vigente"),
    (14, Decimal("100000.00"),  6, 130,  30, "vigente"),
    # ---- Lote D: morosos con buckets PAR diferenciados ----
    (15, Decimal("85000.00"),   6,  30, -20, "moroso"),    # PAR30 (20d atraso)
    (16, Decimal("140000.00"),  6,  35, -45, "moroso"),    # PAR60 (45d atraso)
    (17, Decimal("200000.00"), 12,  40, -75, "moroso"),    # PAR90 (75d atraso)
    (18, Decimal("50000.00"),   3,  45,-100, "moroso"),    # castigado (>90d)
    (19, Decimal("175000.00"),  6,  50, -35, "moroso"),    # PAR30-PAR60
    # ---- Lote E: novacion refinanciacion ----
    (20, Decimal("100000.00"),  6,  30,  30, "novar_refi"),
    # ---- Lote F: novacion consolidacion (misma persona p_idx=21) ----
    (21, Decimal("90000.00"),   6,  35,  30, "novar_consol_a"),
    (21, Decimal("80000.00"),   6,  38,  30, "novar_consol_b"),
    # ---- Lote G: pagos con excedente ----
    (22, Decimal("55000.00"),   3,  60,  30, "excedente"),
    (23, Decimal("75000.00"),   3,  65,  30, "excedente"),
    # ---- Lote H: cancelacion anticipada ----
    (24, Decimal("220000.00"), 12,  62,  30, "cancelar_anticipado"),
    (25, Decimal("170000.00"),  6,  68,  30, "cancelar_anticipado"),
    # ---- Lote I: mix (pagos parciales / tasa alta) ----
    (26, Decimal("90000.00"),   6,  72,  30, "mix"),
    (27, Decimal("130000.00"), 12,  78,  30, "mix"),
    (28, Decimal("75000.00"),   6,  83,  30, "mix"),
    (29, Decimal("110000.00"),  6,  86,  30, "mix"),
    # ---- Lote J: créditos recientes (clientes recurrentes) ----
    (0,  Decimal("95000.00"),   6, 130,  30, "vigente"),   # p_idx=0 2º crédito
    (3,  Decimal("180000.00"),  6,  60,  30, "pagado"),    # p_idx=3 2º pagado
    (3,  Decimal("250000.00"), 12, 140,  30, "vigente"),   # p_idx=3 3º activo
]

# Perfiles de pricing con tasas diferenciadas
_PERFILES_TASAS = [
    ("Estandar Full",    Decimal("0.28")),
    ("Premium Full",     Decimal("0.32")),
    ("Riesgo Alto Full", Decimal("0.38")),
]


def _perfil_para_slot(slot: int) -> str:
    return _PERFILES_TASAS[slot % len(_PERFILES_TASAS)][0]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

class _SeedBcraClient:
    """Re-estampa fecha_informe a hoy para que las personas aprueben bajo la
    vigencia BCRA por defecto sin tocar PARAMETROS_GLOBALES."""

    def __init__(self) -> None:
        self._fake = FakeBcraClient()

    async def consultar(self, cuil: str) -> list[DeudaBcraNormalizada]:
        hoy = date.today()
        return [
            DeudaBcraNormalizada(
                entidad=d.entidad, monto=d.monto, situacion=d.situacion,
                fecha_informe=hoy,
            )
            for d in await self._fake.consultar(cuil)
        ]


def _cuil(i: int) -> str:
    """CUIL valido y determinista con DNI disperso en rango 30M–44M."""
    dni = 30_500_000 + i * 487
    prefijo = "27" if i % 2 == 1 else "20"
    base = prefijo + str(dni)
    dv = calcular_digito_verificador(base)
    return base + str(dv)


def _ascii(s: str) -> str:
    """Convierte caracteres con tilde a ASCII básico para emails."""
    return (s.lower()
            .replace("á", "a").replace("é", "e").replace("í", "i")
            .replace("ó", "o").replace("ú", "u").replace("ñ", "n")
            .replace(" ", ""))


def _persona_payload(i: int) -> PersonaCreate:
    es_masculino = i % 2 == 0
    nombre = _NOMBRES_M[i % 20] if es_masculino else _NOMBRES_F[i % 20]
    apellido = _APELLIDOS[i % 30]
    dni = str(30_500_000 + i * 487)
    cuil = _cuil(i)
    email_dominio = "hotmail.com" if i % 3 == 2 else "gmail.com"
    email = f"{_ascii(nombre)}{_ascii(apellido)[:4]}{1985 + i % 20}@{email_dominio}"
    telefono_num = (44_000_000 + i * 1973) % 90_000_000 + 10_000_000
    telefono = f"11{telefono_num}"
    fecha_nac = date(1968 + (i * 7) % 27, (i * 3) % 12 + 1, (i * 11) % 27 + 1)
    estado_civil = ["soltero", "casado", "casado", "divorciado", "union_convivencial"][i % 5]
    calle = _CALLES[i % len(_CALLES)]
    numero = str(100 + i * 37 % 900)
    localidad = _LOCALIDADES_DOM[i % len(_LOCALIDADES_DOM)]
    provincia = _PROVINCIA_MAP.get(localidad, "Buenos Aires")
    tipo_vivienda = ["propia", "alquilada", "familiar", "alquilada"][i % 4]

    perfil_ing = i % 3
    if perfil_ing == 0:
        ingresos = Decimal(str(250_000 + i * 3_000))
    elif perfil_ing == 1:
        ingresos = Decimal(str(400_000 + i * 5_000))
    else:
        ingresos = Decimal(str(500_000 + i * 7_000))

    if i % 2 == 0:
        empleador_nombre: str | None = _EMPLEADORES[i % len(_EMPLEADORES)]
        ingresos_en_blanco = (ingresos * Decimal("0.80")).quantize(Decimal("1.00"))
    else:
        empleador_nombre = None
        ingresos_en_blanco = (ingresos * Decimal("0.40")).quantize(Decimal("1.00"))

    ref_nombre = _NOMBRES_F[(i + 3) % 20]
    ref_apellido = _APELLIDOS[(i + 5) % 30]
    ref_telefono_num = (44_000_000 + (i + 13) * 1973) % 90_000_000 + 10_000_000
    ref_telefono = f"11{ref_telefono_num}"
    ref_vinculo = _VINCULOS[i % len(_VINCULOS)]

    return PersonaCreate(
        apellido=apellido,
        nombre=nombre,
        dni=dni,
        cuil=cuil,
        fecha_nac=fecha_nac,
        estado_civil=estado_civil,
        email=email,
        telefono=telefono,
        domicilio_calle=calle,
        domicilio_numero=numero,
        domicilio_localidad=localidad,
        domicilio_provincia=provincia,
        tipo_vivienda=tipo_vivienda,
        ingresos_declarados=ingresos,
        ingresos_en_blanco=ingresos_en_blanco,
        ingresos_totales=ingresos,
        empleador=empleador_nombre,
        referencias=[
            ReferenciaIn(
                nombre=ref_nombre,
                apellido=ref_apellido,
                telefono=ref_telefono,
                vinculo=ref_vinculo,
            )
        ],
    )


async def _ya_sembrado(session: AsyncSession) -> bool:
    return await session.scalar(
        select(IdempotencyKey).where(
            IdempotencyKey.clave == MARCADOR_COMPLETO,
            IdempotencyKey.operacion == _OP_MARCADOR,
        )
    ) is not None


async def _marcar_completo(session: AsyncSession) -> None:
    ya = await session.scalar(
        select(IdempotencyKey).where(
            IdempotencyKey.clave == MARCADOR_COMPLETO,
            IdempotencyKey.operacion == _OP_MARCADOR,
        )
    )
    if ya is None:
        session.add(IdempotencyKey(
            clave=MARCADOR_COMPLETO, operacion=_OP_MARCADOR, respuesta_json=None,
        ))
        await session.flush()


async def _seed_localidades(session: AsyncSession) -> None:
    from sqlalchemy import select as _sel
    from app.m16_maestros.modelos import Localidad, Provincia
    from app.m16_maestros.datos_geo import LOCALIDADES_POR_PROVINCIA

    for codigo, localidades in LOCALIDADES_POR_PROVINCIA.items():
        prov = await session.scalar(_sel(Provincia).where(Provincia.codigo == codigo))
        if prov is None:
            continue
        for nombre in localidades:
            existe = await session.scalar(
                _sel(Localidad).where(
                    Localidad.provincia_id == prov.id,
                    Localidad.nombre == nombre,
                )
            )
            if existe is None:
                session.add(Localidad(provincia_id=prov.id, nombre=nombre))
    await session.flush()


async def _seed_catalogo_m16(session: AsyncSession) -> tuple[
    dict[str, Zona], dict[str, Sector], dict[str, Tema], dict[str, Canal], dict[str, Disposicion]
]:
    zonas: dict[str, Zona] = {}
    for orden, (codigo, nombre) in enumerate(_ZONAS_CFG):
        obj = await session.scalar(select(Zona).where(Zona.codigo == codigo))
        if obj is None:
            obj = Zona(codigo=codigo, nombre=nombre, orden=orden)
            session.add(obj)
            await session.flush()
        zonas[codigo] = obj

    sectores: dict[str, Sector] = {}
    for orden, (codigo, nombre) in enumerate(_SECTORES_CFG):
        obj = await session.scalar(select(Sector).where(Sector.codigo == codigo))
        if obj is None:
            obj = Sector(codigo=codigo, nombre=nombre, orden=orden)
            session.add(obj)
            await session.flush()
        sectores[codigo] = obj

    temas: dict[str, Tema] = {}
    for orden, (codigo, nombre) in enumerate(_TEMAS_CFG):
        obj = await session.scalar(select(Tema).where(Tema.codigo == codigo))
        if obj is None:
            obj = Tema(codigo=codigo, nombre=nombre, orden=orden)
            session.add(obj)
            await session.flush()
        temas[codigo] = obj

    canales: dict[str, Canal] = {}
    for orden, (codigo, nombre) in enumerate(_CANALES_CFG):
        obj = await session.scalar(select(Canal).where(Canal.codigo == codigo))
        if obj is None:
            obj = Canal(codigo=codigo, nombre=nombre, orden=orden)
            session.add(obj)
            await session.flush()
        canales[codigo] = obj

    disposiciones: dict[str, Disposicion] = {}
    for orden, (codigo, nombre, genera_cobro) in enumerate(_DISPOSICIONES_CFG):
        obj = await session.scalar(select(Disposicion).where(Disposicion.codigo == codigo))
        if obj is None:
            obj = Disposicion(codigo=codigo, nombre=nombre, genera_cobro=genera_cobro, orden=orden)
            session.add(obj)
            await session.flush()
        disposiciones[codigo] = obj

    await session.flush()
    return zonas, sectores, temas, canales, disposiciones


async def _asegurar_roles(session: AsyncSession) -> None:
    for nombre in ROLES:
        if await session.scalar(select(Rol).where(Rol.nombre == nombre)) is None:
            session.add(Rol(nombre=nombre))
    await session.flush()


async def _get_or_create_usuario(
    session: AsyncSession, *,
    email: str, nombre: str, roles: list[str], actor_id: uuid.UUID | None,
) -> Usuario:
    existente = await session.scalar(select(Usuario).where(Usuario.email == email))
    if existente is not None:
        return existente
    return await crear_usuario(
        session, email=email, nombre=nombre, password="demo12345",
        roles=roles, actor_id=actor_id,
    )


def _ikey(*partes: str | int) -> str:
    return f"full-{'-'.join(str(p) for p in partes)}-{SEMILLA}"


async def _try(session: AsyncSession, coro) -> bool:  # type: ignore[type-arg]
    """Ejecuta una coroutine; si falla hace rollback y retorna False."""
    try:
        await coro
        return True
    except Exception:  # noqa: BLE001
        await session.rollback()
        return False


def _fecha_primera_cuota(fecha_des: date, offset_dias: int) -> date:
    raw = fecha_des + timedelta(days=abs(offset_dias)) * (1 if offset_dias >= 0 else -1)
    return raw.replace(day=1)


async def _estado_prestamo(session: AsyncSession, prestamo_id: uuid.UUID) -> str | None:
    from sqlalchemy import text as _text
    row = await session.execute(
        _text("SELECT estado FROM prestamo WHERE id = :id"), {"id": str(prestamo_id)}
    )
    result = row.fetchone()
    return result[0] if result else None


# ---------------------------------------------------------------------------
# Helpers CRM
# ---------------------------------------------------------------------------

async def _ix(
    session: AsyncSession,
    *,
    persona_id: uuid.UUID,
    operador_id: uuid.UUID,
    tipo: str,
    tema_id: uuid.UUID | None,
    canal_id: uuid.UUID | None,
    disposicion_id: uuid.UUID | None,
    detalle: str,
    credito_id: uuid.UUID | None = None,
    proximo_paso_fecha: date | None = None,
    proximo_paso_nota: str | None = None,
    actor_id: uuid.UUID,
) -> bool:
    return await _try(session, crear_interaccion(
        session,
        persona_id=persona_id,
        tipo=tipo,
        detalle=detalle,
        tarea_id=None,
        operador_id=operador_id,
        tema_id=tema_id,
        canal_id=canal_id,
        disposicion_id=disposicion_id,
        credito_id=credito_id,
        proximo_paso_fecha=proximo_paso_fecha,
        proximo_paso_nota=proximo_paso_nota,
        actor_id=actor_id,
        commit=False,
    ))


async def _ix_with_result(
    session: AsyncSession,
    *,
    persona_id: uuid.UUID,
    operador_id: uuid.UUID,
    tipo: str,
    tema_id: uuid.UUID | None,
    canal_id: uuid.UUID | None,
    disposicion_id: uuid.UUID | None,
    detalle: str,
    credito_id: uuid.UUID | None = None,
    proximo_paso_fecha: date | None = None,
    proximo_paso_nota: str | None = None,
    actor_id: uuid.UUID,
) -> Interaccion | None:
    """Como _ix pero devuelve el objeto Interaccion para poder vincular PromesaPago."""
    try:
        ix = await crear_interaccion(
            session,
            persona_id=persona_id,
            tipo=tipo,
            detalle=detalle,
            tarea_id=None,
            operador_id=operador_id,
            tema_id=tema_id,
            canal_id=canal_id,
            disposicion_id=disposicion_id,
            credito_id=credito_id,
            proximo_paso_fecha=proximo_paso_fecha,
            proximo_paso_nota=proximo_paso_nota,
            actor_id=actor_id,
            commit=False,
        )
        await session.flush()
        return ix
    except Exception:  # noqa: BLE001
        await session.rollback()
        return None


async def _promesa_con_ix(
    session: AsyncSession,
    *,
    prestamo_id: uuid.UUID,
    monto: Decimal,
    fecha_prometida: date,
    estado: str,
    interaccion_id: uuid.UUID,
    actor_id: uuid.UUID,
) -> None:
    """Inserta PromesaPago vinculada a una interaccion (constraint XOR)."""
    pp = PromesaPago(
        prestamo_id=prestamo_id,
        monto_prometido=monto,
        fecha_prometida=fecha_prometida,
        estado=estado,
        canal_origen="call",
        interaccion_id=interaccion_id,
        creada_por=actor_id,
    )
    session.add(pp)
    try:
        await session.flush()
    except Exception:  # noqa: BLE001
        await session.rollback()


# ---------------------------------------------------------------------------
# Funcion principal
# ---------------------------------------------------------------------------

async def sembrar_full(session: AsyncSession) -> dict:  # noqa: PLR0912, PLR0915
    """Portafolio completo. Idempotente y crash-safe."""
    if await _ya_sembrado(session):
        print("seed_full: ya sembrado.")  # noqa: T201
        return await _conteos(session)

    await _asegurar_roles(session)
    await _seed_localidades(session)

    # ---- Catálogos m16 ----
    zonas, sectores, temas, canales, disposiciones = await _seed_catalogo_m16(session)
    await session.commit()

    # ---- Usuarios ----
    admin = await _get_or_create_usuario(
        session, email="sistema.full@nexocred.test", nombre="Admin Sistema Full",
        roles=["admin_sistema"], actor_id=None,
    )
    actor = admin.id

    vendedor = await _get_or_create_usuario(
        session, email="vendedor.full@nexocred.test", nombre="Vendedor Full",
        roles=["vendedor"], actor_id=actor,
    )
    cobrador_a = await _get_or_create_usuario(
        session, email="administrativo_a.full@nexocred.test", nombre="Administrativo A Full",
        roles=["administrativo"], actor_id=actor,
    )
    cobrador_b = await _get_or_create_usuario(
        session, email="administrativo_b.full@nexocred.test", nombre="Administrativo B Full",
        roles=["administrativo"], actor_id=actor,
    )
    operador = await _get_or_create_usuario(
        session, email="administrativo.full@nexocred.test", nombre="Administrativo Full",
        roles=["administrativo"], actor_id=actor,
    )
    await _get_or_create_usuario(
        session, email="riesgo.full@nexocred.test", nombre="Analista de Riesgo Full",
        roles=["analista_riesgo"], actor_id=actor,
    )
    await _get_or_create_usuario(
        session, email="ceo.full@nexocred.test", nombre="CEO Full",
        roles=["ceo"], actor_id=actor,
    )

    caja_existente = await session.scalar(select(Caja).where(Caja.nombre == "Caja Full Demo"))
    if caja_existente is None:
        caja_existente = await crear_caja(session, nombre="Caja Full Demo", tipo="efectivo", actor_id=actor)
    caja_id = caja_existente.id
    vendedor_id = vendedor.id
    cobrador_a_id = cobrador_a.id
    cobrador_b_id = cobrador_b.id
    operador_id = operador.id

    # ---- Historial de asignaciones vendedor → zona/sector (3 períodos) ----
    asig_existente = await session.scalar(
        select(AsignacionVendedor).where(AsignacionVendedor.vendedor_id == vendedor_id)
    )
    if asig_existente is None:
        asig_periodos = [
            (FECHA_INICIO,                       FECHA_INICIO + timedelta(days=59),  "norte", "call_center"),
            (FECHA_INICIO + timedelta(days=60),  FECHA_INICIO + timedelta(days=119), "caba",  "presencial"),
            (FECHA_INICIO + timedelta(days=120), None,                                "sur",   "call_center"),
        ]
        for desde, hasta, zona_cod, sector_cod in asig_periodos:
            asig = AsignacionVendedor(
                vendedor_id=vendedor_id,
                zona_id=zonas[zona_cod].id,
                sector_id=sectores[sector_cod].id,
                vigente_desde=desde,
                vigente_hasta=hasta,
            )
            session.add(asig)
            await session.flush()
    await session.commit()

    # ---- Producto ----
    producto = await session.scalar(
        select(ProductoCredito).where(ProductoCredito.nombre == "Prestamo Personal Full")
    )
    if producto is None:
        producto = await cat.crear_producto(
            session,
            ProductoCreate(
                nombre="Prestamo Personal Full", periodicidad="mensual",
                plazos_permitidos=list(PLAZOS),
                monto_minimo=Decimal("10000.00"), monto_maximo=Decimal("5000000.00"),
            ),
            actor_id=actor,
        )
        await cat.publicar_producto(session, producto, actor_id=actor)

    perfiles: dict[str, PerfilPricing] = {}
    for orden, (nombre_perf, tasa_perf) in enumerate(_PERFILES_TASAS, start=1):
        perf = await session.scalar(
            select(PerfilPricing).where(PerfilPricing.nombre == nombre_perf)
        )
        if perf is None:
            perf = await cat.crear_perfil(
                session, nombre=nombre_perf, descripcion=None, orden=orden, actor_id=actor,
            )
        perfiles[nombre_perf] = perf
        await cat.upsert_matriz_tasas(
            session,
            [CeldaTasaIn(
                producto_id=producto.id, perfil_id=perf.id, plazo=p, tasa=tasa_perf,
            ) for p in PLAZOS],
            actor_id=actor,
        )
        comision = Decimal("0.03") if "Riesgo" in nombre_perf else Decimal("0.025")
        await cat.upsert_matriz_comisiones(
            session,
            [CeldaComisionIn(
                producto_id=producto.id, perfil_id=perf.id, comision=comision,
            )],
            actor_id=actor,
        )

    # ---- Tesorería: 3 aportes de distintos inversores ----
    for k, (fecha_aporte, monto_aporte, inversor_nombre, nota_aporte) in enumerate(_APORTES):
        await registrar_aporte(
            session,
            AporteRetiroIn(
                monto=monto_aporte, fecha_negocio=fecha_aporte, caja_id=caja_id,
                inversor=inversor_nombre, nota=nota_aporte,
            ),
            actor_id=actor, idempotency_key=_ikey("aporte", k),
        )

    # ---- Personas + BCRA ----
    bcra = _SeedBcraClient()
    personas: list[uuid.UUID] = []
    personas_con_bcra: list[uuid.UUID] = []
    for i in range(N_PERSONAS):
        cuil = _cuil(i)
        persona = await session.scalar(select(Persona).where(Persona.cuil == cuil))
        if persona is None:
            persona = await crear_persona(session, _persona_payload(i), actor_id=actor)
        ya_bcra = await session.scalar(
            select(PersonaDeudaBcra.id).where(PersonaDeudaBcra.persona_id == persona.id)
        )
        if ya_bcra is None:
            filas = await sincronizar_bcra(session, persona.id, bcra, actor_id=actor)
            tiene_bcra = bool(filas)
        else:
            tiene_bcra = True
        personas.append(persona.id)
        if tiene_bcra:
            personas_con_bcra.append(persona.id)
    await session.commit()

    # ---- Prospectos CRM ----
    prospectos_data = [
        ("Gonzalo Ferreyra",  "1155443322", "contactado"),
        ("Miriam Saldaña",    "1166778899", "calificado"),
        ("Héctor Bravo",      "1177001122", "contactado"),
        ("Patricia Quispe",   "1188334455", "descartado"),
        ("Ernesto Villalba",  "1199667788", "calificado"),
    ]
    for nombre_p, tel_p, estado_p in prospectos_data:
        existe_p = await session.scalar(select(Prospecto).where(Prospecto.nombre == nombre_p))
        if existe_p is None:
            session.add(Prospecto(nombre=nombre_p, telefono=tel_p, estado=estado_p, operador_id=operador_id))
    await session.commit()

    n_aprobables = len(personas_con_bcra)

    def _pid(p_idx: int) -> uuid.UUID:
        return personas_con_bcra[p_idx % n_aprobables]

    # ---- Prestamos: desembolso + devengo de comision ----
    prestamos_por_slot: dict[int, uuid.UUID] = {}

    for slot, (p_idx, monto, cuotas, delta_des, offset_pc, _tag) in enumerate(_LOTES):
        persona_id = _pid(p_idx)
        fecha_des = FECHA_INICIO + timedelta(days=delta_des)
        fecha_pc = _fecha_primera_cuota(fecha_des, offset_pc)
        nombre_perf = _perfil_para_slot(slot)
        perfil = perfiles[nombre_perf]

        existente = await session.scalar(
            select(Prestamo)
            .join(SolicitudCredito, Prestamo.solicitud_id == SolicitudCredito.id)
            .where(
                SolicitudCredito.persona_id == persona_id,
                SolicitudCredito.producto_id == producto.id,
                Prestamo.fecha_desembolso == fecha_des,
            )
        )
        if existente is not None:
            prestamos_por_slot[slot] = existente.id
            continue

        sol = await orig.crear_solicitud(
            session, persona_id=persona_id, producto_id=producto.id,
            monto=monto, cantidad_cuotas=cuotas,
            vendedor_id=vendedor_id, actor_id=actor,
        )
        sol.perfil_id = perfil.id  # type: ignore[attr-defined]
        await session.flush()
        await orig.evaluar(session, sol, actor_id=actor)
        await orig.cambiar_estado(session, sol, "aprobada", motivo_rechazo=None, actor_id=actor)
        await session.commit()

        out = await desembolsar(
            session, solicitud=sol, caja_id=caja_id,
            fecha_negocio=fecha_des, fecha_primera_cuota=fecha_pc,
            tasa_punitorio_diario=Decimal("0.001"),
            idempotency_key=_ikey("des", slot), actor_id=actor,
        )
        prestamo = await session.scalar(
            select(Prestamo).where(Prestamo.id == out.prestamo_id)
        )
        assert prestamo is not None
        prestamos_por_slot[slot] = prestamo.id
        await devengar_por_desembolso(
            session, prestamo=prestamo, solicitud=sol,
            fecha_negocio=fecha_des, actor_id=actor,
        )
        await session.commit()

    # ---- Ciclos de vida por tag ----

    # TAG: "cancelar"
    for slot, (*_, tag) in enumerate(_LOTES):
        if tag != "cancelar":
            continue
        prestamo_id = prestamos_por_slot.get(slot)
        if prestamo_id is None:
            continue
        est = await _estado_prestamo(session, prestamo_id)
        if est not in ("vigente", "en_mora"):
            continue
        _, _, _, delta_des, _, _ = _LOTES[slot]
        fecha_cancel = FECHA_INICIO + timedelta(days=delta_des + 60)
        ok = await _try(session, prest.cancelar(
            session, prestamo_id=prestamo_id, caja_id=caja_id,
            fecha_negocio=fecha_cancel, canal="mostrador",
            idempotency_key=_ikey("cancel", slot), actor_id=actor,
        ))
        if ok:
            await session.commit()

    # TAG: "pagado"
    for slot, (_, monto, cuotas, delta_des, offset_pc, tag) in enumerate(_LOTES):
        if tag != "pagado":
            continue
        prestamo_id = prestamos_por_slot.get(slot)
        if prestamo_id is None:
            continue
        if await _estado_prestamo(session, prestamo_id) in ("cancelado", "novado", "pagado"):
            continue
        cuota_aprox = (monto * Decimal("1.35") / cuotas).quantize(Decimal("100.00"))
        for k in range(cuotas - 1):
            fecha_pago = FECHA_INICIO + timedelta(days=delta_des + offset_pc + k * 30 + 5)
            if fecha_pago > FECHA_ANCLA:
                break
            ok = await _try(session, registrar_pago(
                session, prestamo_id=prestamo_id,
                monto=cuota_aprox, canal="mostrador", caja_id=caja_id,
                fecha_negocio=fecha_pago,
                idempotency_key=_ikey("pago", slot, k), actor_id=actor,
            ))
            if ok:
                await session.commit()
        est_fin = await _estado_prestamo(session, prestamo_id)
        if est_fin in ("vigente", "en_mora"):
            fecha_fin = FECHA_INICIO + timedelta(days=delta_des + offset_pc + cuotas * 30 + 15)
            if fecha_fin <= FECHA_ANCLA:
                ok = await _try(session, prest.cancelar(
                    session, prestamo_id=prestamo_id, caja_id=caja_id,
                    fecha_negocio=fecha_fin, canal="mostrador",
                    idempotency_key=_ikey("cancel-fin", slot), actor_id=actor,
                ))
                if ok:
                    await session.commit()

    # TAG: "vigente"
    for slot, (_, monto, cuotas, delta_des, offset_pc, tag) in enumerate(_LOTES):
        if tag != "vigente":
            continue
        prestamo_id = prestamos_por_slot.get(slot)
        if prestamo_id is None:
            continue
        if await _estado_prestamo(session, prestamo_id) in ("cancelado", "novado", "pagado"):
            continue
        cuota_aprox = (monto * Decimal("1.30") / cuotas).quantize(Decimal("100.00"))
        _fin_pc = FECHA_INICIO + timedelta(days=delta_des + offset_pc)
        n_vencidas = max(0, (FECHA_ANCLA - _fin_pc).days // 30)
        for k in range(min(n_vencidas, cuotas - 1)):
            fecha_pago = FECHA_INICIO + timedelta(days=delta_des + offset_pc + k * 30 + 5)
            if fecha_pago > FECHA_ANCLA:
                break
            ok = await _try(session, registrar_pago(
                session, prestamo_id=prestamo_id,
                monto=cuota_aprox, canal="mostrador", caja_id=caja_id,
                fecha_negocio=fecha_pago,
                idempotency_key=_ikey("pago", slot, k), actor_id=actor,
            ))
            if ok:
                await session.commit()

    # TAG: "novar_refi"
    for slot, (*_, tag) in enumerate(_LOTES):
        if tag != "novar_refi":
            continue
        prestamo_id = prestamos_por_slot.get(slot)
        if prestamo_id is None:
            continue
        if await _estado_prestamo(session, prestamo_id) != "vigente":
            continue
        _, monto, cuotas, delta_des, offset_pc, _ = _LOTES[slot]
        cuota_aprox = (monto * Decimal("1.30") / cuotas).quantize(Decimal("100.00"))
        fecha_pago1 = FECHA_INICIO + timedelta(days=delta_des + offset_pc + 5)
        ok = await _try(session, registrar_pago(
            session, prestamo_id=prestamo_id,
            monto=cuota_aprox, canal="mostrador", caja_id=caja_id,
            fecha_negocio=fecha_pago1,
            idempotency_key=_ikey("pago", slot, 0), actor_id=actor,
        ))
        if ok:
            await session.commit()
        fecha_nov = FECHA_INICIO + timedelta(days=delta_des + 75)
        if fecha_nov > FECHA_ANCLA:
            continue
        ok = await _try(session, nov.refinanciar(
            session, prestamo_id=prestamo_id, caja_id=caja_id,
            fecha_negocio=fecha_nov, tasa=Decimal("0.25"),
            cantidad_cuotas=12, periodicidad="mensual",
            fecha_primera_cuota=(fecha_nov + timedelta(days=30)).replace(day=1),
            idempotency_key=_ikey("nov-refi", slot),
            actor_id=actor,
        ))
        if ok:
            await session.commit()

    # TAG: "novar_consol_a" + "novar_consol_b"
    slots_consol_a = [s for s, (*_, t) in enumerate(_LOTES) if t == "novar_consol_a"]
    slots_consol_b = [s for s, (*_, t) in enumerate(_LOTES) if t == "novar_consol_b"]
    for sa, sb in zip(slots_consol_a, slots_consol_b, strict=False):
        pa_id = prestamos_por_slot.get(sa)
        pb_id = prestamos_por_slot.get(sb)
        if pa_id is None or pb_id is None:
            continue
        pa = await session.scalar(select(Prestamo).where(Prestamo.id == pa_id))
        pb = await session.scalar(select(Prestamo).where(Prestamo.id == pb_id))
        if pa is None or pb is None:
            continue
        if pa.estado != "vigente" or pb.estado != "vigente":
            continue
        if pa.persona_id != pb.persona_id:
            continue
        _, _, _, delta_a, _, _ = _LOTES[sa]
        fecha_nov = FECHA_INICIO + timedelta(days=delta_a + 80)
        if fecha_nov > FECHA_ANCLA:
            continue
        ok = await _try(session, nov.consolidar(
            session, prestamo_ids=[pa_id, pb_id], caja_id=caja_id,
            fecha_negocio=fecha_nov, tasa=Decimal("0.27"),
            cantidad_cuotas=12, periodicidad="mensual",
            fecha_primera_cuota=(fecha_nov + timedelta(days=30)).replace(day=1),
            idempotency_key=_ikey("nov-consol", sa, sb),
            actor_id=actor,
        ))
        if ok:
            await session.commit()

    # TAG: "excedente"
    for slot, (_, monto, cuotas, delta_des, offset_pc, tag) in enumerate(_LOTES):
        if tag != "excedente":
            continue
        prestamo_id = prestamos_por_slot.get(slot)
        if prestamo_id is None:
            continue
        if await _estado_prestamo(session, prestamo_id) in ("cancelado", "novado", "pagado"):
            continue
        cuota_real = (monto * Decimal("1.30") / cuotas).quantize(Decimal("100.00"))
        monto_sobre = cuota_real * Decimal("2.5")
        fecha_pago = FECHA_INICIO + timedelta(days=delta_des + offset_pc + 5)
        if fecha_pago <= FECHA_ANCLA:
            ok = await _try(session, registrar_pago(
                session, prestamo_id=prestamo_id,
                monto=monto_sobre, canal="mostrador", caja_id=caja_id,
                fecha_negocio=fecha_pago,
                idempotency_key=_ikey("pago", slot, 0), actor_id=actor,
            ))
            if ok:
                await session.commit()
        fecha_pago2 = fecha_pago + timedelta(days=35)
        if fecha_pago2 <= FECHA_ANCLA:
            ok = await _try(session, registrar_pago(
                session, prestamo_id=prestamo_id,
                monto=cuota_real, canal="mostrador", caja_id=caja_id,
                fecha_negocio=fecha_pago2,
                idempotency_key=_ikey("pago", slot, 1), actor_id=actor,
            ))
            if ok:
                await session.commit()

    # TAG: "cancelar_anticipado"
    for slot, (_, _, cuotas, delta_des, offset_pc, tag) in enumerate(_LOTES):
        if tag != "cancelar_anticipado":
            continue
        prestamo_id = prestamos_por_slot.get(slot)
        if prestamo_id is None:
            continue
        if await _estado_prestamo(session, prestamo_id) not in ("vigente", "en_mora"):
            continue
        _, monto, cuotas, delta_des, offset_pc, _ = _LOTES[slot]
        cuota_aprox = (monto * Decimal("1.30") / cuotas).quantize(Decimal("100.00"))
        fecha_pago1 = FECHA_INICIO + timedelta(days=delta_des + offset_pc + 5)
        if fecha_pago1 <= FECHA_ANCLA:
            ok = await _try(session, registrar_pago(
                session, prestamo_id=prestamo_id,
                monto=cuota_aprox, canal="mostrador", caja_id=caja_id,
                fecha_negocio=fecha_pago1,
                idempotency_key=_ikey("pago", slot, 0), actor_id=actor,
            ))
            if ok:
                await session.commit()
        fecha_cancel = FECHA_INICIO + timedelta(days=delta_des + offset_pc + cuotas * 30 // 2)
        if fecha_cancel <= FECHA_ANCLA:
            ok = await _try(session, prest.cancelar(
                session, prestamo_id=prestamo_id, caja_id=caja_id,
                fecha_negocio=fecha_cancel, canal="mostrador",
                idempotency_key=_ikey("cancel", slot), actor_id=actor,
            ))
            if ok:
                await session.commit()

    # TAG: "mix"
    for slot, (_, monto, cuotas, delta_des, offset_pc, tag) in enumerate(_LOTES):
        if tag != "mix":
            continue
        prestamo_id = prestamos_por_slot.get(slot)
        if prestamo_id is None:
            continue
        if await _estado_prestamo(session, prestamo_id) in ("cancelado", "novado", "pagado"):
            continue
        cuota_aprox = (monto * Decimal("1.30") / cuotas).quantize(Decimal("100.00"))
        monto_parcial = (cuota_aprox * Decimal("0.60")).quantize(Decimal("100.00"))
        _fin_pc = FECHA_INICIO + timedelta(days=delta_des + offset_pc)
        n_vencidas = max(0, (FECHA_ANCLA - _fin_pc).days // 30)
        for k in range(min(n_vencidas, cuotas - 1)):
            fecha_pago = FECHA_INICIO + timedelta(days=delta_des + offset_pc + k * 30 + 5)
            if fecha_pago > FECHA_ANCLA:
                break
            monto_k = cuota_aprox if k % 2 == 0 else monto_parcial
            ok = await _try(session, registrar_pago(
                session, prestamo_id=prestamo_id,
                monto=monto_k, canal="mostrador", caja_id=caja_id,
                fecha_negocio=fecha_pago,
                idempotency_key=_ikey("pago", slot, k), actor_id=actor,
            ))
            if ok:
                await session.commit()

    # ---- Interacciones CRM coherentes con cada ciclo de vida ----

    # TAG "cancelar": nota de desembolso + confirmación de cancelación
    for slot, (p_idx, monto, cuotas, delta_des, offset_pc, tag) in enumerate(_LOTES):
        if tag != "cancelar":
            continue
        prestamo_id = prestamos_por_slot.get(slot)
        if prestamo_id is None:
            continue
        persona_id = _pid(p_idx)
        ok1 = await _ix(
            session, persona_id=persona_id, operador_id=operador_id,
            tipo="nota", tema_id=temas["consulta"].id,
            canal_id=canales["presencial"].id, disposicion_id=disposiciones["ya_pago"].id,
            detalle="Crédito otorgado. Cliente retiró fondos en sucursal.",
            credito_id=prestamo_id, actor_id=actor,
        )
        if ok1:
            await session.commit()
        ok2 = await _ix(
            session, persona_id=persona_id, operador_id=operador_id,
            tipo="llamada", tema_id=temas["pago"].id,
            canal_id=canales["telefono"].id, disposicion_id=disposiciones["pago_total"].id,
            detalle="Cliente canceló saldo total. Expediente cerrado.",
            credito_id=prestamo_id, actor_id=actor,
        )
        if ok2:
            await session.commit()

    # TAG "pagado": interacción por cada cuota
    for slot, (p_idx, monto, cuotas, delta_des, offset_pc, tag) in enumerate(_LOTES):
        if tag != "pagado":
            continue
        prestamo_id = prestamos_por_slot.get(slot)
        if prestamo_id is None:
            continue
        persona_id = _pid(p_idx)
        for k in range(cuotas - 1):
            fecha_pago = FECHA_INICIO + timedelta(days=delta_des + offset_pc + k * 30 + 6)
            if fecha_pago > FECHA_ANCLA:
                break
            ok = await _ix(
                session, persona_id=persona_id, operador_id=operador_id,
                tipo="llamada", tema_id=temas["pago"].id,
                canal_id=canales["telefono"].id, disposicion_id=disposiciones["pago_total"].id,
                detalle=f"Cliente confirmó pago cuota {k+1}/{cuotas}. Sin novedades.",
                credito_id=prestamo_id, actor_id=actor,
            )
            if ok:
                await session.commit()

    # TAG "vigente": interacción por cada cuota pagada
    for slot, (p_idx, monto, cuotas, delta_des, offset_pc, tag) in enumerate(_LOTES):
        if tag != "vigente":
            continue
        prestamo_id = prestamos_por_slot.get(slot)
        if prestamo_id is None:
            continue
        persona_id = _pid(p_idx)
        _fin_pc = FECHA_INICIO + timedelta(days=delta_des + offset_pc)
        n_vencidas = max(0, (FECHA_ANCLA - _fin_pc).days // 30)
        for k in range(min(n_vencidas, cuotas - 1)):
            fecha_pago = FECHA_INICIO + timedelta(days=delta_des + offset_pc + k * 30 + 6)
            if fecha_pago > FECHA_ANCLA:
                break
            ok = await _ix(
                session, persona_id=persona_id, operador_id=operador_id,
                tipo="llamada", tema_id=temas["pago"].id,
                canal_id=canales["telefono"].id, disposicion_id=disposiciones["pago_total"].id,
                detalle=f"Cuota {k+1} abonada puntualmente. Préstamo al día.",
                credito_id=prestamo_id, actor_id=actor,
            )
            if ok:
                await session.commit()

    # TAG "moroso": gestión de mora con promesas (vigentes y rotas)
    slots_morosos = [s for s, (*_, t) in enumerate(_LOTES) if t == "moroso"]
    for i_m, slot in enumerate(slots_morosos):
        p_idx, monto, cuotas, delta_des, offset_pc, _ = _LOTES[slot]
        prestamo_id = prestamos_por_slot.get(slot)
        if prestamo_id is None:
            continue
        persona_id = _pid(p_idx)
        cuota_aprox = (monto * Decimal("1.35") / cuotas).quantize(Decimal("100.00"))

        ok1 = await _ix(
            session, persona_id=persona_id, operador_id=operador_id,
            tipo="llamada", tema_id=temas["mora"].id,
            canal_id=canales["telefono"].id, disposicion_id=disposiciones["no_contesta"].id,
            detalle="Primer contacto por mora. Cliente no atiende.",
            credito_id=prestamo_id, actor_id=actor,
        )
        if ok1:
            await session.commit()

        ok2 = await _ix(
            session, persona_id=persona_id, operador_id=operador_id,
            tipo="mensaje", tema_id=temas["mora"].id,
            canal_id=canales["whatsapp"].id, disposicion_id=disposiciones["no_contesta"].id,
            detalle="Segundo intento WhatsApp. Sin respuesta del cliente.",
            credito_id=prestamo_id, actor_id=actor,
        )
        if ok2:
            await session.commit()

        ok3 = await _ix(
            session, persona_id=persona_id, operador_id=operador_id,
            tipo="llamada", tema_id=temas["mora"].id,
            canal_id=canales["telefono"].id, disposicion_id=disposiciones["se_niega"].id,
            detalle="Cliente atiende. Manifiesta dificultad económica transitoria.",
            credito_id=prestamo_id, actor_id=actor,
        )
        if ok3:
            await session.commit()

        # Promesa: rota para slots 1 y 3, vigente para el resto
        if i_m % 3 == 1:
            fecha_prom = FECHA_ANCLA - timedelta(days=5)
            prom_estado = "rota"
            prox_fecha = None
            prox_nota = None
        else:
            fecha_prom = FECHA_ANCLA + timedelta(days=10)
            prom_estado = "vigente"
            prox_fecha = fecha_prom + timedelta(days=1)
            prox_nota = "Verificar cumplimiento de promesa"

        ix_prom = await _ix_with_result(
            session, persona_id=persona_id, operador_id=operador_id,
            tipo="llamada", tema_id=temas["mora"].id,
            canal_id=canales["telefono"].id, disposicion_id=disposiciones["promesa_pago"].id,
            detalle=f"Acordada promesa de pago para {fecha_prom}. Monto: ${cuota_aprox:,.0f}.",
            credito_id=prestamo_id,
            proximo_paso_fecha=prox_fecha,
            proximo_paso_nota=prox_nota,
            actor_id=actor,
        )
        if ix_prom is not None:
            await session.commit()
            await _promesa_con_ix(
                session, prestamo_id=prestamo_id, monto=cuota_aprox,
                fecha_prometida=fecha_prom, estado=prom_estado,
                interaccion_id=ix_prom.id, actor_id=actor,
            )
            await session.commit()

    # TAG "novar_refi": interacción de acuerdo previo + confirmación
    for slot, (p_idx, monto, cuotas, delta_des, offset_pc, tag) in enumerate(_LOTES):
        if tag != "novar_refi":
            continue
        prestamo_id = prestamos_por_slot.get(slot)
        if prestamo_id is None:
            continue
        persona_id = _pid(p_idx)
        ok = await _ix(
            session, persona_id=persona_id, operador_id=operador_id,
            tipo="llamada", tema_id=temas["refinanciacion"].id,
            canal_id=canales["telefono"].id, disposicion_id=disposiciones["acuerdo_cuotas"].id,
            detalle="Se acuerda refinanciación. Nuevas condiciones: 12 cuotas al 25%.",
            credito_id=prestamo_id, actor_id=actor,
        )
        if ok:
            await session.commit()
        ok2 = await _ix(
            session, persona_id=persona_id, operador_id=operador_id,
            tipo="nota", tema_id=temas["refinanciacion"].id,
            canal_id=canales["presencial"].id, disposicion_id=disposiciones["ya_pago"].id,
            detalle="Novación de refinanciación confirmada. Nuevo cronograma generado.",
            credito_id=prestamo_id, actor_id=actor,
        )
        if ok2:
            await session.commit()

    # TAG "novar_consol_a": interacción de acuerdo previo
    for slot, (p_idx, monto, cuotas, delta_des, offset_pc, tag) in enumerate(_LOTES):
        if tag != "novar_consol_a":
            continue
        prestamo_id = prestamos_por_slot.get(slot)
        if prestamo_id is None:
            continue
        persona_id = _pid(p_idx)
        ok = await _ix(
            session, persona_id=persona_id, operador_id=operador_id,
            tipo="llamada", tema_id=temas["refinanciacion"].id,
            canal_id=canales["telefono"].id, disposicion_id=disposiciones["acuerdo_cuotas"].id,
            detalle="Se acuerda consolidación de dos préstamos. Plan de 12 cuotas al 27%.",
            credito_id=prestamo_id, actor_id=actor,
        )
        if ok:
            await session.commit()

    # TAG "excedente": llamada post-pago
    for slot, (p_idx, monto, cuotas, delta_des, offset_pc, tag) in enumerate(_LOTES):
        if tag != "excedente":
            continue
        prestamo_id = prestamos_por_slot.get(slot)
        if prestamo_id is None:
            continue
        persona_id = _pid(p_idx)
        ok = await _ix(
            session, persona_id=persona_id, operador_id=operador_id,
            tipo="llamada", tema_id=temas["pago"].id,
            canal_id=canales["telefono"].id, disposicion_id=disposiciones["pago_total"].id,
            detalle="Cliente abonó monto mayor al exigido. Excedente aplicado a próximas cuotas.",
            credito_id=prestamo_id, actor_id=actor,
        )
        if ok:
            await session.commit()

    # TAG "cancelar_anticipado": cuota 1 + cancelación
    for slot, (p_idx, monto, cuotas, delta_des, offset_pc, tag) in enumerate(_LOTES):
        if tag != "cancelar_anticipado":
            continue
        prestamo_id = prestamos_por_slot.get(slot)
        if prestamo_id is None:
            continue
        persona_id = _pid(p_idx)
        ok1 = await _ix(
            session, persona_id=persona_id, operador_id=operador_id,
            tipo="llamada", tema_id=temas["pago"].id,
            canal_id=canales["telefono"].id, disposicion_id=disposiciones["pago_total"].id,
            detalle="Cuota 1 abonada puntualmente.",
            credito_id=prestamo_id, actor_id=actor,
        )
        if ok1:
            await session.commit()
        ok2 = await _ix(
            session, persona_id=persona_id, operador_id=operador_id,
            tipo="llamada", tema_id=temas["pago"].id,
            canal_id=canales["presencial"].id, disposicion_id=disposiciones["pago_total"].id,
            detalle="Cancelación anticipada. Saldo total liquidado. Expediente cerrado.",
            credito_id=prestamo_id, actor_id=actor,
        )
        if ok2:
            await session.commit()

    # TAG "mix": alternando pago completo / parcial con promesas cumplidas
    for slot, (p_idx, monto, cuotas, delta_des, offset_pc, tag) in enumerate(_LOTES):
        if tag != "mix":
            continue
        prestamo_id = prestamos_por_slot.get(slot)
        if prestamo_id is None:
            continue
        persona_id = _pid(p_idx)
        cuota_aprox = (monto * Decimal("1.30") / cuotas).quantize(Decimal("100.00"))
        diferencia = (cuota_aprox * Decimal("0.40")).quantize(Decimal("100.00"))
        _fin_pc = FECHA_INICIO + timedelta(days=delta_des + offset_pc)
        n_vencidas = max(0, (FECHA_ANCLA - _fin_pc).days // 30)
        for k in range(min(n_vencidas, cuotas - 1)):
            fecha_ix = FECHA_INICIO + timedelta(days=delta_des + offset_pc + k * 30 + 6)
            if fecha_ix > FECHA_ANCLA:
                break
            if k % 2 == 0:
                ok = await _ix(
                    session, persona_id=persona_id, operador_id=operador_id,
                    tipo="llamada", tema_id=temas["pago"].id,
                    canal_id=canales["telefono"].id, disposicion_id=disposiciones["pago_total"].id,
                    detalle=f"Cuota {k+1} abonada completa. Préstamo al día.",
                    credito_id=prestamo_id, actor_id=actor,
                )
                if ok:
                    await session.commit()
            else:
                ix_parcial = await _ix_with_result(
                    session, persona_id=persona_id, operador_id=operador_id,
                    tipo="llamada", tema_id=temas["mora"].id,
                    canal_id=canales["telefono"].id, disposicion_id=disposiciones["pago_parcial"].id,
                    detalle=f"Abono parcial cuota {k+1}. Diferencia de ${diferencia:,.0f} pendiente.",
                    credito_id=prestamo_id, actor_id=actor,
                )
                if ix_parcial is not None:
                    await session.commit()
                    fecha_prom_mix = FECHA_INICIO + timedelta(days=delta_des + offset_pc + (k + 1) * 30)
                    await _promesa_con_ix(
                        session, prestamo_id=prestamo_id, monto=diferencia,
                        fecha_prometida=fecha_prom_mix,
                        estado="cumplida",
                        interaccion_id=ix_parcial.id, actor_id=actor,
                    )
                    await session.commit()

    # ---- Rutas: cobrador A x3 fechas + cobrador B x2 fechas ----
    rutas_cfg = [
        (cobrador_a_id, FECHA_INICIO + timedelta(days=30)),
        (cobrador_a_id, FECHA_INICIO + timedelta(days=60)),
        (cobrador_a_id, FECHA_ANCLA),
        (cobrador_b_id, FECHA_INICIO + timedelta(days=45)),
        (cobrador_b_id, FECHA_INICIO + timedelta(days=90)),
    ]
    resultados_ciclo = ["pago", "parcial", "ausente", "promesa", "pago", "se_niega", "pago"]

    for cobrador_id_ruta, fecha_ruta in rutas_cfg:
        ruta = await session.scalar(
            select(RutaDiaria).where(
                RutaDiaria.cobrador_id == cobrador_id_ruta,
                RutaDiaria.fecha == fecha_ruta,
            )
        )
        if ruta is None:
            ruta = await generar_ruta(
                session, cobrador_id=cobrador_id_ruta, fecha=fecha_ruta, actor_id=actor,
            )

        ruta_id_local = ruta.id
        paradas = await paradas_de_ruta(session, ruta_id_local)
        ruta_obj = await obtener_ruta(session, ruta_id_local)
        assert ruta_obj is not None

        cobros = 0
        for k, p in enumerate(paradas[:6]):
            parada = await obtener_parada(session, p.id)
            if parada is None or parada.visitada_en is not None:
                continue
            res_visita = resultados_ciclo[k % len(resultados_ciclo)]
            monto_v = Decimal("20000.00") if res_visita in ("pago", "parcial") else None
            ok = await _try(session, visitar(
                session, ruta=ruta_obj, parada=parada,
                resultado=res_visita, monto_cobrado=monto_v,
                foto_url=None, lat=None, lng=None,
                notas=f"seed full {res_visita}", caja_id=caja_id,
                fecha_negocio=fecha_ruta, actor_id=cobrador_id_ruta,
            ))
            if ok:
                await session.commit()
                if monto_v is not None:
                    cobros += 1
            ruta_obj = await obtener_ruta(session, ruta_id_local)
            if ruta_obj is None:
                break

        if cobros:
            ok = await _try(session, generar_rendicion(
                session, ruta_id=ruta_id_local, fecha_negocio=fecha_ruta,
                actor_id=cobrador_id_ruta,
            ))
            if ok:
                await session.commit()
                rendicion_obj = await obtener_rendicion(session, ruta_id_local)
                if rendicion_obj is not None and rendicion_obj.estado == "pendiente":
                    ok2 = await _try(session, cambiar_estado_rendicion(
                        session, rendicion=rendicion_obj, estado="aprobada",
                        actor_id=actor,
                    ))
                    if ok2:
                        await session.commit()

        await session.commit()

    # ---- Liquidaciones de comisiones: 3 periodos ----
    periodos_liq = [
        (FECHA_INICIO,                          FECHA_INICIO + timedelta(days=59)),
        (FECHA_INICIO + timedelta(days=60),     FECHA_INICIO + timedelta(days=119)),
        (FECHA_INICIO + timedelta(days=120),    FECHA_ANCLA),
    ]
    for k, (desde, hasta) in enumerate(periodos_liq):
        liq = await session.scalar(
            select(ComisionLiquidacion).where(
                ComisionLiquidacion.vendedor_id == vendedor_id,
                ComisionLiquidacion.periodo_desde == desde,
            )
        )
        if liq is None:
            try:
                liq = await generar_liquidacion(
                    session, vendedor_id=vendedor_id,
                    periodo_desde=desde, periodo_hasta=hasta,
                    actor_id=actor,
                )
            except Exception:  # noqa: BLE001
                await session.rollback()
                continue

        if liq.estado == "borrador" and liq.monto_total and liq.monto_total > Decimal("0"):
            ok = await _try(session, aprobar_liquidacion(session, liquidacion=liq, actor_id=actor))
            if ok:
                await session.commit()
                liq = await session.scalar(
                    select(ComisionLiquidacion).where(ComisionLiquidacion.id == liq.id)
                )
            if liq is not None and liq.estado == "aprobada":
                ok2 = await _try(session, pagar_liquidacion(
                    session, liquidacion_id=liq.id, caja_id=caja_id,
                    fecha_negocio=hasta,
                    idempotency_key=_ikey("liq", k), actor_id=actor,
                ))
                if ok2:
                    await session.commit()
        await session.commit()

    # ---- Snapshots semanales ----
    fecha_snap = FECHA_INICIO
    while fecha_snap <= FECHA_ANCLA:
        try:  # noqa: SIM105
            await generar_snapshot(session, fecha_snap, actor_id=actor)
            await session.commit()
        except Exception:  # noqa: BLE001
            await session.rollback()
        fecha_snap += timedelta(weeks=1)

    # ---- Alertas de mora (mensual + cierre) ----
    for mes in range(6):
        fecha_alarma = FECHA_INICIO + timedelta(days=mes * 30)
        try:  # noqa: SIM105
            await procesar_alarmas(session, fecha=fecha_alarma, actor_id=actor)
            await session.commit()
        except Exception:  # noqa: BLE001
            await session.rollback()
    try:  # noqa: SIM105
        await procesar_alarmas(session, fecha=FECHA_ANCLA, actor_id=actor)
        await session.commit()
    except Exception:  # noqa: BLE001
        await session.rollback()

    # ---- CRM: tareas e incidentes para morosos con tipos variados ----
    tipos_incidente = [
        ("mora",    "alta",   "Deuda vencida >30 días. Requiere gestión de cobranza."),
        ("mora",    "alta",   "Primera cuota sin pago. Cliente no localizado."),
        ("mora",    "media",  "Atraso en cuota. En seguimiento telefónico."),
        ("disputa", "media",  "Cliente disputa monto de cuota 2. Revisión pendiente."),
        ("fraude",  "alta",   "Posible uso fraudulento de datos. Requiere verificación urgente."),
    ]
    for i_m, slot in enumerate(slots_morosos):
        p_idx = _LOTES[slot][0]
        persona_id = _pid(p_idx)
        ok = await _try(session, crear_tarea(
            session, persona_id=persona_id, operador_id=operador_id,
            titulo=f"Gestionar mora — slot {slot}",
            descripcion="Contactar deudor para plan de regularización.",
            prioridad="alta",
            vencimiento=FECHA_ANCLA + timedelta(days=7),
            origen="alarma", actor_id=actor, commit=False,
        ))
        if ok:
            await session.commit()
        tipo_inc, severidad_inc, detalle_inc = tipos_incidente[i_m % len(tipos_incidente)]
        ok2 = await _try(session, crear_incidente(
            session, persona_id=persona_id,
            tipo=tipo_inc,
            titulo=f"{tipo_inc.capitalize()} detectado — slot {slot}",
            severidad=severidad_inc,
            detalle=detalle_inc,
            operador_id=operador_id, actor_id=actor,
        ))
        if ok2:
            await session.commit()
    await session.commit()

    # ---- Documentos: cronograma + recibo para primeros 10 slots ----
    for slot in range(min(10, len(prestamos_por_slot))):
        prestamo_id_doc = prestamos_por_slot.get(slot)
        if prestamo_id_doc is None:
            continue
        for tipo in ("cronograma", "recibo"):
            ok = await _try(session, docs.generar(
                session, tipo=tipo, prestamo_id=prestamo_id_doc,
                actor_id=actor,
                idempotency_key=_ikey("doc", tipo, slot),
            ))
            if ok:
                await session.commit()
    await session.commit()

    # ---- Marcador final (crash-safe) ----
    await _marcar_completo(session)
    await session.commit()

    return await _conteos(session)


async def _conteos(session: AsyncSession) -> dict:
    from sqlalchemy import func, text

    from app.m01_personas.modelos import Persona
    from app.modelos_stub import (
        Alerta,
        DocumentoEmitido,
        Pago,
        SnapshotCartera,
        Tarea,
    )

    async def _c(modelo) -> int:
        return await session.scalar(select(func.count()).select_from(modelo)) or 0

    estados = {}
    res = await session.execute(
        text("SELECT estado, count(*) FROM prestamo GROUP BY estado")
    )
    for estado, cnt in res.all():
        estados[estado] = cnt

    return {
        "personas": await _c(Persona),
        "prestamos": sum(estados.values()),
        "prestamos_por_estado": estados,
        "solicitudes": await _c(SolicitudCredito),
        "pagos": await _c(Pago),
        "alertas": await _c(Alerta),
        "snapshots": await _c(SnapshotCartera),
        "tareas": await _c(Tarea),
        "documentos": await _c(DocumentoEmitido),
    }


async def _reset_marcador(session: AsyncSession) -> None:
    marcador = await session.scalar(
        select(IdempotencyKey).where(
            IdempotencyKey.clave == MARCADOR_COMPLETO,
            IdempotencyKey.operacion == _OP_MARCADOR,
        )
    )
    if marcador is not None:
        await session.delete(marcador)
        await session.commit()
        print("seed_full: marcador eliminado, la proxima corrida re-siembra.")  # noqa: T201


async def _main() -> None:
    from app.db import async_session_maker

    async with async_session_maker() as session:
        if "--reset" in sys.argv:
            await _reset_marcador(session)
        res = await sembrar_full(session)
        await session.commit()

    print("Siembra full completa:", res)  # noqa: T201


if __name__ == "__main__":
    asyncio.run(_main())
