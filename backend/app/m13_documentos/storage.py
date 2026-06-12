"""Adaptador de almacenamiento de documentos.

`Storage` es un Protocol (interfaz) para que un adaptador S3 pueda reemplazar al
local sin tocar el servicio. `StorageLocal` persiste bytes en el filesystem bajo un
directorio base configurable y devuelve una url `file://`.
"""

import hashlib
from pathlib import Path
from typing import Protocol, runtime_checkable


def hash_sha256(contenido: bytes) -> str:
    """Hash hex estable del contenido (inmutabilidad/auditabilidad del documento)."""
    return hashlib.sha256(contenido).hexdigest()


@runtime_checkable
class Storage(Protocol):
    def guardar(self, path: str, contenido: bytes) -> str: ...

    def leer(self, url: str) -> bytes: ...


class StorageLocal:
    """Adaptador de filesystem local (POC). S3-ready: misma interfaz `Storage`."""

    def __init__(self, base_dir: str | Path) -> None:
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def _resolver(self, url_o_path: str) -> Path:
        if url_o_path.startswith("file://"):
            return Path(url_o_path.removeprefix("file://"))
        return self.base_dir / url_o_path

    def guardar(self, path: str, contenido: bytes) -> str:
        destino = self.base_dir / path
        destino.parent.mkdir(parents=True, exist_ok=True)
        destino.write_bytes(contenido)
        return f"file://{destino}"

    def leer(self, url: str) -> bytes:
        return self._resolver(url).read_bytes()
