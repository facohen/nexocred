"""Logging estructurado (JSON) + request-id por contextvar + helper de log de job.

- `RequestIDMiddleware`: genera (o respeta) un `X-Request-ID` por request, lo guarda
  en un contextvar y lo refleja en el header de respuesta.
- `FormatterJSON`: serializa cada LogRecord como una linea JSON, incluyendo el
  request id vigente y los campos extra (`job`, `campos`).
- `log_job(nombre, **campos)`: emite un record estructurado para un job batch.
- `configurar_logging()`: instala el formatter JSON en el root logger.
"""

import json
import logging
import uuid
from contextvars import ContextVar

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

HEADER_REQUEST_ID = "X-Request-ID"
SIN_REQUEST = "-"

request_id_var: ContextVar[str] = ContextVar("request_id", default=SIN_REQUEST)

_jobs_logger = logging.getLogger("nexocred.jobs")


def get_request_id() -> str:
    return request_id_var.get()


class RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        rid = request.headers.get(HEADER_REQUEST_ID) or str(uuid.uuid4())
        token = request_id_var.set(rid)
        try:
            response = await call_next(request)
        finally:
            request_id_var.reset(token)
        response.headers[HEADER_REQUEST_ID] = rid
        return response


class FormatterJSON(logging.Formatter):
    """Serializa cada record como una linea JSON con request id y campos extra."""

    _CAMPOS_RESERVADOS = set(logging.LogRecord(
        "", 0, "", 0, "", (), None
    ).__dict__) | {"message", "asctime"}

    def format(self, record: logging.LogRecord) -> str:
        payload: dict = {
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": request_id_var.get(),
        }
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        # Campos extra adjuntados via logging `extra={...}`.
        for clave, valor in record.__dict__.items():
            if clave not in self._CAMPOS_RESERVADOS and clave not in payload:
                payload[clave] = valor
        return json.dumps(payload, default=str, ensure_ascii=False)


def log_job(nombre: str, *, nivel: int = logging.INFO, **campos) -> None:
    """Emite un log estructurado para un job batch (nombre + campos de negocio)."""
    _jobs_logger.log(
        nivel, "job %s", nombre, extra={"job": nombre, "campos": campos}
    )


def configurar_logging(nivel: int = logging.INFO) -> None:
    """Instala el formatter JSON en el root logger (idempotente)."""
    root = logging.getLogger()
    root.setLevel(nivel)
    handler = logging.StreamHandler()
    handler.setFormatter(FormatterJSON())
    # Reemplaza handlers previos para evitar duplicados al reconfigurar.
    root.handlers = [handler]
    # Silenciamos el ruido de librerias de cliente HTTP (no son logs de negocio).
    for ruidoso in ("httpx", "httpcore"):
        logging.getLogger(ruidoso).setLevel(logging.WARNING)
