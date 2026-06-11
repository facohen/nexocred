from app.db import Base
from app.registro_modelos import cargar_todos_los_modelos


def test_todas_las_tablas_registradas():
    cargar_todos_los_modelos()
    tablas = set(Base.metadata.tables.keys())
    esperadas = {
        "usuario", "rol", "usuario_rol",
        "persona", "persona_referencia", "persona_marca", "persona_deuda_bcra",
        "producto_credito", "producto_version", "gasto_originacion",
        "perfil_pricing", "matriz_tasa", "matriz_comision",
        "auditoria_evento", "idempotency_key",
        "solicitud_credito", "prestamo", "cuota", "pago", "imputacion",
        "movimiento_caja", "ruta_diaria", "parada_ruta", "comision_devengo",
        "snapshot_cartera", "tarea", "incidente", "alerta",
        "workflow_regla", "workflow_ejecucion", "documento_emitido",
        "liquidacion_comision", "liquidacion_detalle",
    }
    faltantes = esperadas - tablas
    assert not faltantes, f"faltan tablas: {faltantes}"
