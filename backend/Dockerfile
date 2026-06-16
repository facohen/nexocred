FROM mambaorg/micromamba:2.3.3

WORKDIR /app

COPY --chown=$MAMBA_USER:$MAMBA_USER environment.yml /tmp/environment.yml
# `micromamba install` no procesa el subbloque `pip:` de environment.yml; `env update` sí.
# Así las deps pip (pyjwt, passlib, asyncpg, celery, etc.) quedan en el env base.
RUN micromamba env update -y -n base -f /tmp/environment.yml && micromamba clean --all --yes

COPY --chown=$MAMBA_USER:$MAMBA_USER backend /app/backend

ENV PYTHONPATH=/app/backend
EXPOSE 8000

CMD ["micromamba", "run", "-n", "base", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
