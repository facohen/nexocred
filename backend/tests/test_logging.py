"""Task 3: request-id middleware, formatter JSON y helper de log de job."""

import json
import logging
import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.logging_setup import (
    FormatterJSON,
    get_request_id,
    log_job,
    request_id_var,
)
from app.main import crear_app


@pytest.mark.asyncio
async def test_response_lleva_request_id_generado() -> None:
    app = crear_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.get("/healthcheck")
    assert "X-Request-ID" in r.headers
    # es un UUID valido
    uuid.UUID(r.headers["X-Request-ID"])


@pytest.mark.asyncio
async def test_response_eco_del_request_id_provisto() -> None:
    app = crear_app()
    transport = ASGITransport(app=app)
    provisto = "mi-request-id-123"
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.get("/healthcheck", headers={"X-Request-ID": provisto})
    assert r.headers["X-Request-ID"] == provisto


def test_formatter_json_incluye_request_id() -> None:
    token = request_id_var.set("rid-abc")
    try:
        record = logging.LogRecord(
            name="test", level=logging.INFO, pathname=__file__, lineno=1,
            msg="hola mundo", args=(), exc_info=None,
        )
        out = json.loads(FormatterJSON().format(record))
        assert out["request_id"] == "rid-abc"
        assert out["message"] == "hola mundo"
        assert out["level"] == "INFO"
    finally:
        request_id_var.reset(token)


def test_log_job_emite_record_estructurado(caplog) -> None:
    with caplog.at_level(logging.INFO, logger="nexocred.jobs"):
        log_job("snapshot", fecha="2026-06-11", filas=3)
    assert len(caplog.records) == 1
    rec = caplog.records[0]
    assert rec.job == "snapshot"
    assert rec.campos == {"fecha": "2026-06-11", "filas": 3}


def test_get_request_id_default_cuando_no_seteado() -> None:
    # Fuera de un request, devuelve un placeholder estable, no crashea.
    assert isinstance(get_request_id(), str)
