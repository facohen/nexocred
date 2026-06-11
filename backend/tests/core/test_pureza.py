"""Guarda de frontera dura de spec 5.1: el core es puro, sin I/O ni reloj."""

import ast
import pathlib

CORE_DIR = pathlib.Path(__file__).resolve().parents[2] / "nexocred_core"

PROHIBIDOS = {
    "fastapi",
    "sqlalchemy",
    "celery",
    "redis",
    "psycopg",
    "psycopg2",
    "asyncpg",
    "pydantic",
    "pydantic_settings",
    "app",  # el paquete de backend con I/O
    "httpx",
    "requests",
    "os",
    "time",
}

# Llamadas de reloj prohibidas dentro del core.
RELOJ_PROHIBIDO = {"now", "today", "utcnow"}


def _modulos_core():
    return list(CORE_DIR.glob("*.py"))


def test_core_no_importa_modulos_prohibidos():
    ofensas = []
    for archivo in _modulos_core():
        arbol = ast.parse(archivo.read_text(), filename=str(archivo))
        for nodo in ast.walk(arbol):
            if isinstance(nodo, ast.Import):
                for alias in nodo.names:
                    raiz = alias.name.split(".")[0]
                    if raiz in PROHIBIDOS:
                        ofensas.append(f"{archivo.name}: import {alias.name}")
            elif isinstance(nodo, ast.ImportFrom):
                raiz = (nodo.module or "").split(".")[0]
                if raiz in PROHIBIDOS:
                    ofensas.append(f"{archivo.name}: from {nodo.module} import ...")
    assert not ofensas, f"el core importa modulos prohibidos: {ofensas}"


def test_core_no_lee_reloj_del_sistema():
    ofensas = []
    for archivo in _modulos_core():
        arbol = ast.parse(archivo.read_text(), filename=str(archivo))
        for nodo in ast.walk(arbol):
            if isinstance(nodo, ast.Attribute) and nodo.attr in RELOJ_PROHIBIDO:
                ofensas.append(f"{archivo.name}: uso de .{nodo.attr}()")
    assert not ofensas, f"el core lee el reloj del sistema: {ofensas}"
