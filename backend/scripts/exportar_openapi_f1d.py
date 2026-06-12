"""Exporta el esquema OpenAPI de la app (superficie F1d) a docs/openapi/f1d.json."""

import json
from pathlib import Path

from app.main import crear_app


def main() -> None:
    app = crear_app()
    esquema = app.openapi()
    destino = Path(__file__).resolve().parents[2] / "docs" / "openapi" / "f1d.json"
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(json.dumps(esquema, indent=2, ensure_ascii=False), encoding="utf-8")

    paths = esquema.get("paths", {})
    requeridos = [
        "/api/v1/tesoreria/posicion", "/api/v1/tesoreria/aportes",
        "/api/v1/torre/resumen", "/api/v1/torre/alertas-live",
        "/api/v1/workflow-reglas", "/api/v1/workflows/procesar",
        "/api/v1/documentos/generar", "/api/v1/jobs/aging",
        "/api/v1/torre/snapshot",
    ]
    faltantes = [p for p in requeridos if p not in paths]
    if faltantes:
        raise SystemExit(f"OpenAPI F1d incompleto, faltan: {faltantes}")
    print(f"OpenAPI F1d exportado a {destino} ({len(paths)} paths)")


if __name__ == "__main__":
    main()
