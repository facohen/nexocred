"""Exporta el esquema OpenAPI de la app (superficie F1c) a docs/openapi/f1c.json."""

import json
from pathlib import Path

from app.main import crear_app


def main() -> None:
    app = crear_app()
    esquema = app.openapi()
    destino = Path(__file__).resolve().parents[2] / "docs" / "openapi" / "f1c.json"
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(json.dumps(esquema, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"OpenAPI F1c exportado a {destino}")


if __name__ == "__main__":
    main()
