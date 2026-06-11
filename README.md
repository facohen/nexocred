# NexoCred

POC de NexoCred.

## Entorno local

Crear o actualizar el entorno Conda:

```bash
conda env create -f environment.yml
conda activate nexocred
```

Si el entorno ya existe:

```bash
conda env update -n nexocred -f environment.yml --prune
conda activate nexocred
```

## Tests

```bash
pytest
ruff check .
pyright
```

## Servicios externos

```bash
docker compose up -d db redis
docker compose ps
```

## API en Docker

```bash
docker compose up -d api
curl http://localhost:8001/healthcheck
```

## Orden de implementacion

1. Stage 0: entorno y estructura.
2. Stage 1: `nexocred_core`.
3. Stage 2: F1a backend base, M12 minimo, M15 y M01.
4. Stage 3: F1b originacion, prestamos, caja, pagos y novaciones.
5. Stage 4: F1c campo, CRM, comercial y riesgo.
6. Stage 5: F1d tesoreria, La Torre, workflows y documentos.
7. Stage 6-7: frontend y PWA.
8. Stage 8: hardening y release candidate.
