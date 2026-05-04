"""
Controlador principal del modulo futbol.
"""

from models.video_processor import VideoProcessor
from services.calculo_service import CalculoService


class FutbolController:
    # Inicializa servicios de procesado y calculo.
    def __init__(self) -> None:
        self.processor = VideoProcessor()
        self.calculo = CalculoService()

    # Ejecuta el pipeline de analisis del golpeo y arma la respuesta final.
    def procesar_golpeo(self, ruta_video: str, incluir_landmarks: bool = False) -> dict:
        frames, info = self.processor.procesar(ruta_video)
        if not frames or info is None:
            return {
                "mensaje": "No se detectaron landmarks en el video.",
                "confianza": 0,
                "angulo_cadera_deg": None,
                "angulo_rodilla_deg": None,
                "angulo_tobillo_deg": None,
                "estabilidad_tronco": None,
                "pierna_golpeo": "desconocida",
                "pierna_apoyo": "desconocida",
            }

        resultado = self.calculo.calcular_metricas(frames, info)

        if not incluir_landmarks:
            resultado.pop("landmarks_frames", None)

        return resultado
