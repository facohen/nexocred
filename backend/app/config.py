from pydantic_settings import BaseSettings, SettingsConfigDict


class Configuracion(BaseSettings):
    ambiente: str = "local"
    database_url: str = "postgresql+asyncpg://nexocred:nexocred@localhost:5432/nexocred"
    jwt_secret_key: str = "change-me-in-local-env"
    jwt_algoritmo: str = "HS256"
    jwt_access_minutos: int = 30
    jwt_refresh_dias: int = 7
    bcra_vigencia_dias: int = 30

    model_config = SettingsConfigDict(env_file=".env", env_prefix="", extra="ignore")


configuracion = Configuracion()
