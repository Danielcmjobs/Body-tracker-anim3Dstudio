"""Parseo reutilizable de campos provenientes de formularios HTTP."""

from __future__ import annotations

_TRUTHY = {"1", "true", "si", "yes", "on"}


def parse_bool(value, default: bool = False) -> bool:
    """Convierte un valor de formulario a bool de manera robusta."""
    if value is None:
        return default
    return str(value).strip().lower() in _TRUTHY
