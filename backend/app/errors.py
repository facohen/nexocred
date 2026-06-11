from fastapi import Request
from fastapi.responses import JSONResponse


class ErrorAPI(Exception):
    def __init__(
        self, code: str, message: str, status: int = 400, details: dict | None = None
    ):
        self.code = code
        self.message = message
        self.status = status
        self.details = details or {}
        super().__init__(message)


def sobre_error(code: str, message: str, details: dict | None = None) -> dict:
    return {"error": {"code": code, "message": message, "details": details or {}}}


async def manejar_error_api(request: Request, exc: ErrorAPI) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status, content=sobre_error(exc.code, exc.message, exc.details)
    )
