"""Enriquece el esquema OpenAPI con cosas que FastAPI no infiere solo.

Dos huecos que el codegen del frontend necesita y FastAPI no declara:

1. **Bearer auth**: las rutas usan `Depends(get_current_user)` que lee el header
   `Authorization` a mano, no `OAuth2PasswordBearer`, así que FastAPI no emite
   `securitySchemes`. Lo inyectamos para que el cliente tipado sepa que hay auth.
2. **Envelope de error**: los errores se serializan como `{error:{code,message,
   details}}` (ver `errors.py`), pero FastAPI solo declara `HTTPValidationError`.
   Declaramos el componente `ErrorEnvelope` para que el frontend lo tipe.
"""

from typing import TYPE_CHECKING

from fastapi.openapi.utils import get_openapi

if TYPE_CHECKING:
    from fastapi import FastAPI

_ERROR_ENVELOPE_SCHEMA = {
    "type": "object",
    "required": ["error"],
    "properties": {
        "error": {
            "type": "object",
            "required": ["code", "message"],
            "properties": {
                "code": {"type": "string"},
                "message": {"type": "string"},
                "details": {"type": "object", "additionalProperties": True},
            },
        }
    },
}


def personalizar_openapi(app: "FastAPI") -> None:
    """Instala un generador de OpenAPI que agrega bearer auth + ErrorEnvelope."""

    def openapi():  # noqa: ANN202 - firma que espera FastAPI
        if app.openapi_schema:
            return app.openapi_schema

        schema = get_openapi(
            title=app.title,
            version=app.version,
            routes=app.routes,
        )

        componentes = schema.setdefault("components", {})

        # 1. Bearer JWT como esquema de seguridad global.
        componentes.setdefault("securitySchemes", {})["BearerAuth"] = {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
        }
        schema["security"] = [{"BearerAuth": []}]

        # 2. Envelope de error como componente reutilizable.
        componentes.setdefault("schemas", {})["ErrorEnvelope"] = _ERROR_ENVELOPE_SCHEMA

        app.openapi_schema = schema
        return schema

    app.openapi = openapi  # type: ignore[method-assign]
