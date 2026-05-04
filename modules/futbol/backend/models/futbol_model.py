"""
Modelo de persistencia para golpes de futbol.
"""

from datetime import datetime

from models.db import get_connection
from utils.serializers import normalizar_float


class FutbolModel:
    def guardar_golpeo(self, id_usuario: int, data: dict) -> dict:
        payload = {
            "angulo_cadera_deg": normalizar_float(data.get("angulo_cadera_deg")),
            "angulo_rodilla_deg": normalizar_float(data.get("angulo_rodilla_deg")),
            "angulo_tobillo_deg": normalizar_float(data.get("angulo_tobillo_deg")),
            "estabilidad_tronco": normalizar_float(data.get("estabilidad_tronco")),
            "pierna_golpeo": data.get("pierna_golpeo") or "desconocida",
            "pierna_apoyo": data.get("pierna_apoyo") or "desconocida",
            "confianza": normalizar_float(data.get("confianza")),
        }

        with get_connection() as (conn, cursor):
            cursor.execute(
                """
                INSERT INTO golpes_futbol
                (id_usuario, angulo_cadera_deg, angulo_rodilla_deg, angulo_tobillo_deg,
                 estabilidad_tronco, pierna_golpeo, pierna_apoyo, confianza, fecha_golpeo)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    id_usuario,
                    payload["angulo_cadera_deg"],
                    payload["angulo_rodilla_deg"],
                    payload["angulo_tobillo_deg"],
                    payload["estabilidad_tronco"],
                    payload["pierna_golpeo"],
                    payload["pierna_apoyo"],
                    payload["confianza"],
                    datetime.now(),
                ),
            )
            payload["id_golpeo"] = cursor.lastrowid

        return payload

    def obtener_por_usuario(self, id_usuario: int) -> list[dict]:
        with get_connection() as (conn, cursor):
            cursor.execute(
                """
                SELECT id_golpeo, id_usuario, angulo_cadera_deg, angulo_rodilla_deg,
                       angulo_tobillo_deg, estabilidad_tronco, pierna_golpeo, pierna_apoyo,
                       confianza, fecha_golpeo
                  FROM golpes_futbol
                 WHERE id_usuario = %s
                 ORDER BY fecha_golpeo DESC
                """,
                (id_usuario,),
            )
            return cursor.fetchall()
