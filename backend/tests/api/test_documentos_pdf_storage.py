"""Tests unitarios (sin DB) de storage adapter, generacion PDF y hash SHA-256."""

from app.m13_documentos.pdf import generar_pdf
from app.m13_documentos.storage import Storage, StorageLocal, hash_sha256


def test_storage_local_roundtrip(tmp_path):
    st = StorageLocal(tmp_path)
    url = st.guardar("recibo/1.pdf", b"contenido-bin")
    assert url.startswith("file://")
    assert st.leer(url) == b"contenido-bin"


def test_storage_cumple_protocolo(tmp_path):
    st = StorageLocal(tmp_path)
    assert isinstance(st, Storage)


def test_generar_pdf_real():
    pdf = generar_pdf("recibo", {"numero": 1, "monto": "1000.00"})
    assert isinstance(pdf, bytes)
    assert pdf.startswith(b"%PDF")
    assert len(pdf) > 100


def test_hash_estable():
    pdf = generar_pdf("recibo", {"numero": 1, "monto": "1000.00"})
    pdf2 = generar_pdf("recibo", {"numero": 1, "monto": "1000.00"})
    assert hash_sha256(pdf) == hash_sha256(pdf2)
    assert len(hash_sha256(pdf)) == 64


def test_hash_distinto_por_contenido():
    a = generar_pdf("recibo", {"numero": 1, "monto": "1000.00"})
    b = generar_pdf("recibo", {"numero": 2, "monto": "2000.00"})
    assert hash_sha256(a) != hash_sha256(b)
