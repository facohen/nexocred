"""App Celery para los jobs F1d (snapshot, punitorios, aging).

Los jobs reales son funciones puras/transaccionales testeables directamente
(sin broker). Las tasks Celery son envoltorios delgados que se ejecutan en un
worker con Redis en produccion. En tests llamamos a las funciones, no a las tasks.
"""

import os

from celery import Celery

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "nexocred",
    broker=REDIS_URL,
    backend=REDIS_URL,
)
celery_app.conf.task_serializer = "json"
celery_app.conf.result_serializer = "json"
celery_app.conf.accept_content = ["json"]
# No fijamos task_always_eager globalmente: los tests invocan las funciones de job
# directamente, no via el broker.
