"""
Controlador para la gestion de usuarios del modulo de futbol.
"""

from flask import Blueprint, jsonify, request
from models.usuarios_futbol_model import UsuariosFutbolModel

usuarios_futbol_bp = Blueprint("usuarios_futbol_bp", __name__)
modelo = UsuariosFutbolModel()


@usuarios_futbol_bp.route("/api/usuarios_futbol", methods=["GET"])
def get_usuarios():
    paginado = request.args.get("paginado", "false").lower() in {"true", "1"}
    search = request.args.get("search", None)
    limit = int(request.args.get("limit", 20))
    offset = int(request.args.get("offset", 0))
    
    usuarios = modelo.obtener_todos(paginado, search, limit, offset)
    total = modelo.contar_total(search)
    
    return jsonify({"usuarios": usuarios, "total": total})


@usuarios_futbol_bp.route("/api/usuarios_futbol/<int:id_usuario>", methods=["GET"])
def get_usuario(id_usuario):
    usuario = modelo.obtener_por_id(id_usuario)
    if usuario:
        return jsonify(usuario)
    return jsonify({"error": "Usuario no encontrado"}), 404


@usuarios_futbol_bp.route("/api/usuarios_futbol", methods=["POST"])
def create_usuario():
    data = request.json
    if not data or not data.get("alias") or not (data.get("nombre") or data.get("nombre_completo")):
        return jsonify({"error": "Datos incompletos (alias y nombre obligatorios)"}), 400

    altura_raw = data.get("altura_m")
    if altura_raw is None or str(altura_raw).strip() == "":
        return jsonify({"error": "La altura (altura_m) es obligatoria"}), 400
    try:
        altura = float(altura_raw)
    except (TypeError, ValueError):
        return jsonify({"error": "altura_m debe ser un numero valido"}), 400
    if not (0.50 <= altura <= 2.50):
        return jsonify({"error": "altura_m debe estar entre 0.50 y 2.50 metros"}), 400
    data["altura_m"] = altura

    nuevo_id = modelo.crear(data)
    if nuevo_id:
        return jsonify({"id_usuario": nuevo_id}), 201
    return jsonify({"error": "No se pudo crear el usuario"}), 500


@usuarios_futbol_bp.route("/api/usuarios_futbol/<int:id_usuario>", methods=["PUT"])
def update_usuario(id_usuario):
    data = request.json
    if not data:
        return jsonify({"error": "Datos incompletos"}), 400

    if "altura_m" in data:
        altura_raw = data.get("altura_m")
        if altura_raw is None or str(altura_raw).strip() == "":
            return jsonify({"error": "La altura (altura_m) es obligatoria"}), 400
        try:
            altura = float(altura_raw)
        except (TypeError, ValueError):
            return jsonify({"error": "altura_m debe ser un numero valido"}), 400
        if not (0.50 <= altura <= 2.50):
            return jsonify({"error": "altura_m debe estar entre 0.50 y 2.50 metros"}), 400
        data["altura_m"] = altura

    filas_afectadas = modelo.actualizar(id_usuario, data)
    if filas_afectadas > 0:
        return jsonify({"mensaje": "Usuario actualizado"}), 200
    return jsonify({"error": "No se pudo actualizar o no hubo cambios"}), 404


@usuarios_futbol_bp.route("/api/usuarios_futbol/<int:id_usuario>", methods=["DELETE"])
def delete_usuario(id_usuario):
    filas_afectadas = modelo.eliminar(id_usuario)
    if filas_afectadas > 0:
        return jsonify({"mensaje": "Usuario eliminado"}), 200
    return jsonify({"error": "Usuario no encontrado"}), 404
