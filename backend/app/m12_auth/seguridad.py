import uuid
from datetime import UTC, datetime, timedelta

import bcrypt
import jwt

from app.config import configuracion


def _normalizar(password: str) -> bytes:
    # bcrypt opera sobre como maximo 72 bytes; truncamos de forma determinista.
    return password.encode("utf-8")[:72]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_normalizar(password), bcrypt.gensalt()).decode("ascii")


def verificar_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(_normalizar(password), password_hash.encode("ascii"))
    except ValueError:
        return False


def _crear_token(
    sub: str, roles: list[str], tipo: str, expira: timedelta
) -> str:
    ahora = datetime.now(UTC)
    payload = {
        "sub": sub,
        "roles": roles,
        "type": tipo,
        "iat": ahora,
        "exp": ahora + expira,
    }
    return jwt.encode(
        payload, configuracion.jwt_secret_key, algorithm=configuracion.jwt_algoritmo
    )


def crear_access_token(user_id: uuid.UUID, roles: list[str]) -> str:
    return _crear_token(
        str(user_id), roles, "access",
        timedelta(minutes=configuracion.jwt_access_minutos),
    )


def crear_refresh_token(user_id: uuid.UUID, roles: list[str]) -> str:
    return _crear_token(
        str(user_id), roles, "refresh",
        timedelta(days=configuracion.jwt_refresh_dias),
    )


def decodificar_token(token: str) -> dict:
    return jwt.decode(
        token, configuracion.jwt_secret_key, algorithms=[configuracion.jwt_algoritmo]
    )
