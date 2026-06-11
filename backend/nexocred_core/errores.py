"""Errores de dominio estables del core. Nunca usar excepciones genericas."""


class ErrorDominio(Exception):
    """Base de todos los errores de dominio del core."""


class ImporteNegativoError(ErrorDominio):
    """Un importe fue negativo donde no esta permitido."""


class TransicionInvalidaError(ErrorDominio):
    """Transicion de estado no permitida por la maquina de estados."""
