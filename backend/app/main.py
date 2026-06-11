from fastapi import FastAPI

from app.api import api_v1
from app.errors import ErrorAPI, manejar_error_api


def crear_app() -> FastAPI:
    app = FastAPI(title="NexoCred API", version="0.1.0")

    app.add_exception_handler(ErrorAPI, manejar_error_api)  # type: ignore[arg-type]
    app.include_router(api_v1)

    @app.get("/healthcheck", tags=["sistema"])
    async def healthcheck() -> dict[str, str]:
        return {"estado": "ok"}

    return app


app = crear_app()
