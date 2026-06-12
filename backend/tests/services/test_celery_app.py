from app.jobs.celery_app import celery_app


def test_celery_app_configurada():
    assert celery_app.main == "nexocred"
    assert "redis" in celery_app.conf.broker_url
    assert celery_app.conf.task_serializer == "json"
