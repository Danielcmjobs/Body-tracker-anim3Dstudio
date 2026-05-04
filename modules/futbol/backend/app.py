"""
Punto de entrada web del modulo futbol.

Recibe un video grabado desde el movil, lo procesa con MediaPipe
para obtener metricas biomecanicas del golpeo.
"""

import os
import uuid

from dotenv import load_dotenv
load_dotenv()

from flask import Flask, jsonify, request
from flask_cors import CORS
from werkzeug.utils import secure_filename

from config import (
    CORS_ORIGINS,
    EXTENSIONES_PERMITIDAS,
    FLASK_PORT,
    MAX_UPLOAD_MB,
    UPLOAD_FOLDER,
)
from controllers.futbol_controller import FutbolController
from controllers.futbol_db_controller import futbol_db_bp
from models.futbol_model import FutbolModel

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_MB * 1024 * 1024
CORS(app, origins=CORS_ORIGINS)

app.register_blueprint(futbol_db_bp)

controller = FutbolController()
modelo_futbol = FutbolModel()

os.makedirs(UPLOAD_FOLDER, exist_ok=True)


@app.errorhandler(413)
# Responde cuando el archivo subido supera el limite permitido.
def archivo_demasiado_grande(_e):
    return jsonify({"error": f"El archivo excede el limite de {MAX_UPLOAD_MB} MB"}), 413


@app.route("/api/futbol/analizar", methods=["POST"])
# Recibe un video, valida formato y devuelve las metricas del golpeo.
def analizar_golpeo():
    if "video" not in request.files:
        return jsonify({"error": "No se recibio ningun archivo de video"}), 400

    archivo = request.files["video"]
    if archivo.filename == "":
        return jsonify({"error": "El archivo no tiene nombre"}), 400

    ext = os.path.splitext(secure_filename(archivo.filename))[1].lower()
    if ext not in EXTENSIONES_PERMITIDAS:
        return jsonify({
            "error": f"Extension no permitida. Usa: {', '.join(EXTENSIONES_PERMITIDAS)}"
        }), 400

    nombre_archivo = f"{uuid.uuid4().hex}{ext}"
    ruta_video = os.path.join(UPLOAD_FOLDER, nombre_archivo)
    archivo.save(ruta_video)

    incluir_landmarks = (request.form.get("incluir_landmarks", "false").strip().lower() in {
        "1", "true", "si", "yes"
    })

    resultado = controller.procesar_golpeo(ruta_video, incluir_landmarks=incluir_landmarks)

    id_usuario = request.form.get("id_usuario")
    guardar_bd = request.form.get("guardar_bd", "false").strip().lower() in {"1", "true", "si", "yes"}
    if guardar_bd and id_usuario:
        try:
            modelo_futbol.guardar_golpeo(int(id_usuario), resultado)
        except Exception:
            return jsonify({"error": "No se pudo guardar el golpeo en la base de datos."}), 500

    return jsonify(resultado)


if __name__ == "__main__":
    project_root = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
    cert_file = os.path.join(project_root, "certs", "cert.pem")
    key_file = os.path.join(project_root, "certs", "key.pem")
    ssl_context = None

    if os.path.exists(cert_file) and os.path.exists(key_file):
        ssl_context = (cert_file, key_file)
        print(f"[INFO] API disponible en https://localhost:{FLASK_PORT}/api/futbol/analizar")
    else:
        print("[WARN] Certificados SSL no encontrados en certs/. Arrancando en HTTP.")
        print(f"[INFO] API disponible en http://localhost:{FLASK_PORT}/api/futbol/analizar")

    app.run(host="0.0.0.0", port=FLASK_PORT, debug=False, ssl_context=ssl_context)
