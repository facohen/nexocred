from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import api_v1
from app.config import configuracion
from app.errors import ErrorAPI, manejar_error_api
from app.logging_setup import RequestIDMiddleware, configurar_logging
from app.openapi_custom import personalizar_openapi


def crear_app() -> FastAPI:
    configurar_logging()
    app = FastAPI(title="NexoCred API", version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=configuracion.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(RequestIDMiddleware)
    app.add_exception_handler(ErrorAPI, manejar_error_api)  # type: ignore[arg-type]
    app.include_router(api_v1)

    # Inyecta bearer auth + ErrorEnvelope en el OpenAPI (para el codegen del front).
    personalizar_openapi(app)

    @app.get("/healthcheck", tags=["sistema"])
    async def healthcheck() -> dict[str, str]:
        return {"estado": "ok"}

    return app


app = crear_app()
