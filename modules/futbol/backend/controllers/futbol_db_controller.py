"""
Endpoints CRUD basicos para golpes de futbol.
"""

from flask import Blueprint, jsonify, request

from models.futbol_model import FutbolModel

futbol_db_bp = Blueprint("futbol_db", __name__)
modelo = FutbolModel()


@futbol_db_bp.route("/api/futbol/guardar", methods=["POST"])
# Guarda un golpeo en la base de datos desde un payload JSON.
def guardar_golpeo():
    data = request.get_json(silent=True) or {}
    id_usuario = data.get("id_usuario")
    if not id_usuario:
        return jsonify({"error": "id_usuario es obligatorio"}), 400

    try:
        payload = modelo.guardar_golpeo(int(id_usuario), data)
        return jsonify(payload), 201
    except Exception:
        return jsonify({"error": "No se pudo guardar el golpeo"}), 500


@futbol_db_bp.route("/api/futbol/usuario/<int:id_usuario>", methods=["GET"])
# Devuelve el historial de golpes de un usuario.
def obtener_golpeos(id_usuario: int):
    try:
        golpes = modelo.obtener_por_usuario(id_usuario)
        return jsonify(golpes), 200
    except Exception:
        return jsonify({"error": "No se pudieron cargar los golpes"}), 500
