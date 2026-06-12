"""Helpers de siembra compartidos para los tests F1d (snapshot, torre, documentos)."""

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.m01_personas.modelos import Persona
from app.m15_catalogo.modelos import ProductoCredito
from app.modelos_stub import Prestamo


def _cuil() -> str:
    return "20" + str(uuid.uuid4().int)[:9]


async def crear_persona(session: AsyncSession, nombre: str = "Cliente") -> Persona:
    p = Persona(
        apellido="Apellido", nombre=nombre, dni=str(uuid.uuid4().int)[:8],
        cuil=_cuil(), fecha_nac=date(1990, 1, 1), estado_civil="soltero",
        email=f"{uuid.uuid4().hex[:8]}@test.com", telefono="1100000000",
        domicilio_calle="Calle", domicilio_localidad="CABA",
        domicilio_provincia="Buenos Aires", tipo_vivienda="propia",
        ingresos_declarados=Decimal("500000"), ingresos_totales=Decimal("500000"),
    )
    session.add(p)
    await session.flush()
    return p


async def crear_producto(session: AsyncSession, nombre: str = "Producto") -> ProductoCredito:
    prod = ProductoCredito(nombre=nombre, estado="activo", activo=True)
    session.add(prod)
    await session.flush()
    return prod


async def crear_prestamo(
    session: AsyncSession,
    persona_id: uuid.UUID,
    producto_id: uuid.UUID,
    *,
    capital: Decimal,
    estado: str = "vigente",
    fecha_desembolso: date | None = None,
    monto_desembolsado: Decimal | None = None,
    tasa_punitorio_diario: Decimal = Decimal("0.001"),
) -> Prestamo:
    p = Prestamo(
        persona_id=persona_id, producto_id=producto_id, capital=capital,
        estado=estado, fecha_desembolso=fecha_desembolso,
        monto_desembolsado=monto_desembolsado if monto_desembolsado is not None else capital,
        tasa_punitorio_diario=tasa_punitorio_diario,
    )
    session.add(p)
    await session.flush()
    return p
