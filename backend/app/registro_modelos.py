def cargar_todos_los_modelos() -> None:
    """Importa todos los modulos de modelos para poblar Base.metadata."""
    from app import auditoria, idempotencia, modelos_stub  # noqa: F401
    from app.m01_personas import modelos as _m01  # noqa: F401
    from app.m04_caja import modelos as _m04  # noqa: F401
    from app.m06_novaciones import modelos as _m06  # noqa: F401
    from app.m12_auth import modelos as _m12  # noqa: F401
    from app.m15_catalogo import modelos as _m15  # noqa: F401
