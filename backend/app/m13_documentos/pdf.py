"""Generacion de PDFs reales (fpdf2) por tipo de documento.

Layouts minimos pero reales (recibo / cronograma / mutuo / pagare /
conformidad_novacion). El contenido es determinista a partir de `datos` para que el
hash SHA-256 sea estable y auditable.
"""

from datetime import datetime, timezone

from fpdf import FPDF

# Fecha de creacion fija -> el PDF es deterministico y su hash SHA-256 es estable.
_FECHA_FIJA = datetime(2020, 1, 1, tzinfo=timezone.utc)

_TITULOS = {
    "recibo": "RECIBO DE PAGO",
    "cronograma": "CRONOGRAMA DE CUOTAS",
    "mutuo": "CONTRATO DE MUTUO",
    "pagare": "PAGARE",
    "conformidad_novacion": "CONFORMIDAD DE NOVACION",
}


def generar_pdf(tipo: str, datos: dict) -> bytes:
    titulo = _TITULOS.get(tipo, tipo.upper())
    pdf = FPDF()
    pdf.creation_date = _FECHA_FIJA
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, "NexoCred", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(0, 10, titulo, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)
    pdf.set_font("Helvetica", "", 11)

    numero = datos.get("numero")
    if numero is not None:
        pdf.cell(0, 8, f"Numero: {tipo}-{int(numero):08d}", new_x="LMARGIN", new_y="NEXT")
    for clave in ("prestamo_id", "persona", "fecha", "monto", "capital", "detalle"):
        if clave in datos and datos[clave] is not None:
            pdf.cell(0, 8, f"{clave.capitalize()}: {datos[clave]}",
                     new_x="LMARGIN", new_y="NEXT")

    filas = datos.get("filas")
    if filas:
        pdf.ln(2)
        pdf.set_font("Helvetica", "B", 10)
        pdf.cell(0, 8, "Cuota | Vencimiento | Capital | Interes | Total",
                 new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 10)
        for f in filas:
            linea = " | ".join(str(f.get(c, "")) for c in
                               ("numero", "vencimiento", "capital", "interes", "total"))
            pdf.cell(0, 7, linea, new_x="LMARGIN", new_y="NEXT")

    salida = pdf.output()
    return bytes(salida)
