from pydantic_settings import BaseSettings, SettingsConfigDict


class Configuracion(BaseSettings):
    ambiente: str = "local"

    model_config = SettingsConfigDict(env_file=".env", env_prefix="NEXOCRED_")
