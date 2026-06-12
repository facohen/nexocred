"""Task 8: scripts de backup/restore ejecutables y docs con secciones requeridas."""

import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


def test_backup_y_restore_existen_y_ejecutables() -> None:
    for nombre in ("backup.sh", "restore.sh"):
        ruta = REPO_ROOT / "backend" / "scripts" / nombre
        assert ruta.exists(), nombre
        assert os.access(ruta, os.X_OK), f"{nombre} no es ejecutable"
        contenido = ruta.read_text()
        assert "pg_dump" in contenido or "pg_restore" in contenido


def test_runbook_tiene_secciones() -> None:
    runbook = (REPO_ROOT / "docs" / "RUNBOOK.md").read_text().lower()
    secciones = (
        "docker compose", "alembic", "upgrade head", "seed_demo",
        "backup", "restore", "demo",
    )
    for seccion in secciones:
        assert seccion in runbook, seccion


def test_release_notes_tiene_secciones() -> None:
    notes = (REPO_ROOT / "docs" / "RELEASE_NOTES.md").read_text().lower()
    assert "limitaciones conocidas" in notes or "known limitations" in notes
    # Las 3 decisiones de politica de negocio pendientes deben estar listadas.
    assert "imputaci" in notes  # orden de imputacion vs §5.4
    assert "excedente" in notes  # saldo a favor vs amortiza ultimas cuotas
    assert "offline" in notes  # offline-strict para mostrador
    # Reconstruccion historica as-of diferida.
    assert "as-of" in notes or "as of" in notes or "historic" in notes
