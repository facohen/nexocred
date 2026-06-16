import logging

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

JWT_SECRET_DEFECTO = "change-me-in-local-env"
AMBIENTES_NO_PROD = {"local", "test", "dev"}

_log = logging.getLogger(__name__)


class Configuracion(BaseSettings):
    ambiente: str = "local"
    database_url: str = "postgresql+asyncpg://nexocred:nexocred@localhost:5432/nexocred"
    jwt_secret_key: str = JWT_SECRET_DEFECTO
    jwt_algoritmo: str = "HS256"
    jwt_access_minutos: int = 30
    jwt_refresh_dias: int = 7
    bcra_vigencia_dias: int = 30
    documentos_dir: str = "/tmp/nexocred_documentos"
    cors_origins: list[str] = ["http://localhost:5173"]

    model_config = SettingsConfigDict(env_file=".env", env_prefix="", extra="ignore")

    @model_validator(mode="after")
    def _validar_secreto_jwt(self) -> "Configuracion":
        es_prod = self.ambiente not in AMBIENTES_NO_PROD
        if es_prod and self.jwt_secret_key == JWT_SECRET_DEFECTO:
            raise ValueError(
                f"jwt_secret_key no puede ser el valor por defecto "
                f"'{JWT_SECRET_DEFECTO}' en ambiente '{self.ambiente}'. "
                "Configure un secreto real via JWT_SECRET_KEY."
            )
        if not es_prod and self.jwt_secret_key == JWT_SECRET_DEFECTO:
            _log.warning(
                "jwt_secret_key usa el valor por defecto en ambiente '%s'. "
                "Configure JWT_SECRET_KEY antes de exponer este servicio.",
                self.ambiente,
            )
        return self


configuracion = Configuracion()
