import pytest

from app.config import Configuracion

SECRETO_DEFECTO = "change-me-in-local-env"
SECRETO_REAL = "una-clave-secreta-suficientemente-larga-1234567890"


def test_prod_con_secreto_defecto_falla():
    with pytest.raises(ValueError):
        Configuracion(ambiente="produccion", jwt_secret_key=SECRETO_DEFECTO)


def test_prod_con_secreto_real_no_falla():
    cfg = Configuracion(ambiente="produccion", jwt_secret_key=SECRETO_REAL)
    assert cfg.jwt_secret_key == SECRETO_REAL


def test_local_con_secreto_defecto_no_falla():
    cfg = Configuracion(ambiente="local", jwt_secret_key=SECRETO_DEFECTO)
    assert cfg.jwt_secret_key == SECRETO_DEFECTO
