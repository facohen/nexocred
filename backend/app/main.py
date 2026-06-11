from fastapi import FastAPI


def crear_app() -> FastAPI:
    app = FastAPI(title="NexoCred API", version="0.1.0")

    @app.get("/healthcheck", tags=["sistema"])
    async def healthcheck() -> dict[str, str]:
        return {"estado": "ok"}

    return app


app = crear_app()
