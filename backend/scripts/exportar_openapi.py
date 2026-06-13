"""Exporta el esquema OpenAPI VIVO de la app a frontend/openapi.json.

Fuente de verdad única del contrato API para el codegen del frontend
(openapi-typescript -> schema.ts). Reemplaza los exportar_openapi_f1*.py por
módulo: el spec se deriva siempre de la app montada, nunca a mano.

Uso:
    cd backend && conda run -n nexocred python -m scripts.exportar_openapi
"""

import json
from pathlib import Path

from app.main import crear_app

# Superficie mínima esperada: si falta algo de esto, el backend se rompió
# y no queremos congelar un contrato incompleto para el frontend.
PATHS_REQUERIDOS = [
    "/api/v1/auth/login",
    "/api/v1/personas",
    "/api/v1/solicitudes",
    "/api/v1/prestamos",
    "/api/v1/pagos",
    "/api/v1/cajas",
    "/api/v1/rutas",
    "/api/v1/novaciones/refinanciar",
    "/api/v1/riesgo/tablero",
    "/api/v1/tareas",
    "/api/v1/tesoreria/posicion",
    "/api/v1/torre/resumen",
    "/api/v1/documentos/generar",
    "/api/v1/productos",
]


def main() -> None:
    app = crear_app()
    esquema = app.openapi()

    paths = esquema.get("paths", {})
    faltantes = [p for p in PATHS_REQUERIDOS if p not in paths]
    if faltantes:
        raise SystemExit(f"OpenAPI incompleto, faltan paths: {faltantes}")

    destino = Path(__file__).resolve().parents[2] / "frontend" / "openapi.json"
    destino.write_text(
        json.dumps(esquema, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"OpenAPI exportado a {destino} ({len(paths)} paths)")  # noqa: T201


if __name__ == "__main__":
    main()
