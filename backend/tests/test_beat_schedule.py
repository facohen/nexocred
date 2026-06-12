"""Task 2: beat_schedule cubre los cinco jobs nocturnos/horarios."""

from app.jobs.celery_app import celery_app


def test_beat_schedule_tiene_los_cinco_jobs() -> None:
    sched = celery_app.conf.beat_schedule
    for nombre in (
        "punitorios",
        "aging",
        "snapshot",
        "generar_rutas",
        "barrer_workflows",
    ):
        assert nombre in sched, nombre


def test_cada_entrada_apunta_a_una_task_registrada() -> None:
    sched = celery_app.conf.beat_schedule
    # Importa los modulos de task para que queden registrados.
    import app.jobs.aging  # noqa: F401
    import app.jobs.punitorios  # noqa: F401
    import app.jobs.rutas  # noqa: F401
    import app.jobs.snapshot  # noqa: F401
    import app.jobs.workflows_job  # noqa: F401

    for entrada in sched.values():
        assert entrada["task"] in celery_app.tasks, entrada["task"]
        assert entrada["schedule"] is not None
