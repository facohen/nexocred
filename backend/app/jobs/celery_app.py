"""App Celery para los jobs F1d (snapshot, punitorios, aging).

Los jobs reales son funciones puras/transaccionales testeables directamente
(sin broker). Las tasks Celery son envoltorios delgados que se ejecutan en un
worker con Redis en produccion. En tests llamamos a las funciones, no a las tasks.
"""

import os

from celery import Celery
from celery.schedules import crontab

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "nexocred",
    broker=REDIS_URL,
    backend=REDIS_URL,
)
celery_app.conf.task_serializer = "json"
celery_app.conf.result_serializer = "json"
celery_app.conf.accept_content = ["json"]
celery_app.conf.timezone = "America/Argentina/Buenos_Aires"  # type: ignore[assignment]
# No fijamos task_always_eager globalmente: los tests invocan las funciones de job
# directamente, no via el broker.

# Cargar los modulos de task para que beat pueda referenciarlas por nombre.
celery_app.conf.imports = (
    "app.jobs.punitorios",
    "app.jobs.aging",
    "app.jobs.snapshot",
    "app.jobs.rutas",
    "app.jobs.workflows_job",
)

# Calendario nocturno (cron). Las tasks reciben la fecha de negocio como ISO; el
# wrapper de produccion la resuelve (date.today()) al ejecutarse en el worker.
celery_app.conf.beat_schedule = {
    "punitorios": {
        "task": "app.jobs.punitorios.task_devengar_punitorios",
        "schedule": crontab(hour=2, minute=0),
    },
    "aging": {
        "task": "app.jobs.aging.task_recalcular_aging",
        "schedule": crontab(hour=2, minute=30),
    },
    "snapshot": {
        "task": "app.jobs.snapshot.task_generar_snapshot",
        "schedule": crontab(hour=3, minute=0),
    },
    "generar_rutas": {
        "task": "app.jobs.rutas.task_generar_rutas",
        "schedule": crontab(hour=6, minute=0),
    },
    "barrer_workflows": {
        "task": "app.jobs.workflows_job.task_barrer_workflows",
        "schedule": crontab(minute=0),  # cada hora en punto
    },
}
