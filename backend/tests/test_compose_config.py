"""Task 1: el compose declara el stack §4 completo (api, db, redis, worker, beat, web)."""

from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]


def _compose() -> dict:
    with open(REPO_ROOT / "docker-compose.yml") as f:
        return yaml.safe_load(f)


def test_compose_tiene_stack_completo() -> None:
    compose = _compose()
    servicios = set(compose["services"])
    for s in ["api", "db", "redis", "worker", "beat", "web"]:
        assert s in servicios, s


def test_worker_corre_celery_worker() -> None:
    compose = _compose()
    cmd = compose["services"]["worker"]["command"]
    cmd_str = " ".join(cmd) if isinstance(cmd, list) else cmd
    assert "celery" in cmd_str.lower()
    assert "worker" in cmd_str.lower()
    assert "app.jobs.celery_app" in cmd_str


def test_beat_corre_celery_beat() -> None:
    compose = _compose()
    cmd = compose["services"]["beat"]["command"]
    cmd_str = " ".join(cmd) if isinstance(cmd, list) else cmd
    assert "celery" in cmd_str.lower()
    assert "beat" in cmd_str.lower()
    assert "app.jobs.celery_app" in cmd_str


def test_worker_y_beat_comparten_db_y_redis() -> None:
    compose = _compose()
    for svc in ("worker", "beat"):
        env = compose["services"][svc]["environment"]
        assert "DATABASE_URL" in env, svc
        assert "REDIS_URL" in env, svc


def test_web_sirve_frontend() -> None:
    compose = _compose()
    web = compose["services"]["web"]
    # nginx sirviendo el build estatico del frontend.
    assert "nginx" in str(web.get("image", "")).lower()
    volumes = " ".join(web.get("volumes", []))
    assert "dist" in volumes or "frontend" in volumes
