"""Validadores de entrada reutilizables para endpoints de futbol."""

from __future__ import annotations


def parse_altura_m(value) -> float:
    """Valida altura_m en metros dentro del rango permitido."""
    try:
        altura = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("altura_m debe ser un numero valido") from exc

    if not (0.50 <= altura <= 2.50):
        raise ValueError("altura_m debe estar entre 0.50 y 2.50 metros")

    return altura


def parse_peso_kg(value) -> float:
    """Valida peso_kg en kilogramos dentro del rango permitido."""
    try:
        peso = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("peso_kg debe ser un numero valido") from exc

    if not (20 <= peso <= 300):
        raise ValueError("peso_kg debe estar entre 20 y 300 kg")

    return peso
