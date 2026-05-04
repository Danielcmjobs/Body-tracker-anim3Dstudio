"""
Calcula metricas del golpeo de futbol a partir de los landmarks.
"""

import statistics

from services.biomecanica_service import angulo_3p, mid_point


class CalculoService:
    # Calcula angulos y estabilidad a partir de los frames validos.
    def calcular_metricas(self, frames: list, info) -> dict:
        frames_validos = [f for f in frames if f.cadera_izq and f.cadera_der]
        if not frames_validos:
            return {
                "mensaje": "No hay frames validos para calcular metricas.",
                "confianza": 0,
                "angulo_cadera_deg": None,
                "angulo_rodilla_deg": None,
                "angulo_tobillo_deg": None,
                "estabilidad_tronco": None,
                "pierna_golpeo": "desconocida",
                "pierna_apoyo": "desconocida",
            }

        frame_ref = frames_validos[-1]

        ang_rod_izq = angulo_3p(frame_ref.cadera_izq, frame_ref.rodilla_izq, frame_ref.tobillo_izq)
        ang_rod_der = angulo_3p(frame_ref.cadera_der, frame_ref.rodilla_der, frame_ref.tobillo_der)

        ang_cad_izq = angulo_3p(frame_ref.hombro_izq, frame_ref.cadera_izq, frame_ref.rodilla_izq)
        ang_cad_der = angulo_3p(frame_ref.hombro_der, frame_ref.cadera_der, frame_ref.rodilla_der)

        ang_tob_izq = angulo_3p(frame_ref.rodilla_izq, frame_ref.tobillo_izq, frame_ref.punta_izq)
        ang_tob_der = angulo_3p(frame_ref.rodilla_der, frame_ref.tobillo_der, frame_ref.punta_der)

        pierna_golpeo = "izquierda" if _menor_angulo(ang_rod_izq, ang_rod_der) == "izq" else "derecha"
        pierna_apoyo = "derecha" if pierna_golpeo == "izquierda" else "izquierda"

        angulo_cadera = _promedio([ang_cad_izq, ang_cad_der])
        angulo_rodilla = ang_rod_izq if pierna_golpeo == "izquierda" else ang_rod_der
        angulo_tobillo = ang_tob_izq if pierna_golpeo == "izquierda" else ang_tob_der

        estabilidad = _estabilidad_tronco(frames_validos, info.ancho)
        confianza = round(len(frames_validos) / max(1, len(frames)), 3)

        return {
            "angulo_cadera_deg": _redondear(angulo_cadera),
            "angulo_rodilla_deg": _redondear(angulo_rodilla),
            "angulo_tobillo_deg": _redondear(angulo_tobillo),
            "estabilidad_tronco": _redondear(estabilidad),
            "pierna_golpeo": pierna_golpeo,
            "pierna_apoyo": pierna_apoyo,
            "confianza": confianza,
            "landmarks_frames": [
                {
                    "frame_idx": f.frame_idx,
                    "timestamp_s": f.timestamp_s,
                    "landmarks": f.landmarks,
                }
                for f in frames
                if f.landmarks
            ],
        }


# Promedia valores ignorando None.
def _promedio(valores: list[float | None]) -> float | None:
    datos = [v for v in valores if v is not None]
    if not datos:
        return None
    return sum(datos) / len(datos)


# Decide la pierna con menor angulo de rodilla.
def _menor_angulo(izq: float | None, der: float | None) -> str:
    if izq is None and der is None:
        return "izq"
    if izq is None:
        return "der"
    if der is None:
        return "izq"
    return "izq" if izq < der else "der"


# Estima estabilidad del tronco a partir del desvio horizontal.
def _estabilidad_tronco(frames: list, ancho: int) -> float | None:
    if ancho <= 0:
        return None

    centros = []
    for f in frames:
        centro = mid_point(f.hombro_izq, f.hombro_der)
        if centro:
            centros.append(centro[0])

    if len(centros) < 2:
        return None

    desvio = statistics.pstdev(centros)
    variacion = (desvio / ancho) * 100
    score = max(0.0, 100.0 - (variacion * 2.5))
    return score


# Redondea valores numericos o conserva None.
def _redondear(valor: float | None) -> float | None:
    if valor is None:
        return None
    return round(float(valor), 2)
