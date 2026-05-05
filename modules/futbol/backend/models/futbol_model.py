"""
Modelo de persistencia para golpes de futbol.
"""

from datetime import datetime
import json
import logging

import mysql.connector

from models.db import get_connection
from utils.serializers import normalizar_float


class FutbolModel:
    _cache_columnas: dict[str, bool] = {}

    @classmethod
    def _tiene_columna(cls, cur, tabla: str, columna: str) -> bool:
        key = f"{tabla}.{columna}"
        if key in cls._cache_columnas:
            return cls._cache_columnas[key]

        cur.execute(
            "SELECT COUNT(*) AS total "
            "FROM INFORMATION_SCHEMA.COLUMNS "
            "WHERE TABLE_SCHEMA = DATABASE() "
            "AND TABLE_NAME = %s "
            "AND COLUMN_NAME = %s",
            (tabla, columna),
        )
        row = cur.fetchone() or {"total": 0}
        cls._cache_columnas[key] = int(row.get("total", 0)) > 0
        return cls._cache_columnas[key]

    @classmethod
    def _expr_col(cls, cur, tabla_alias: str, tabla_real: str, columna: str, alias: str | None = None) -> str:
        out_alias = alias or columna
        if cls._tiene_columna(cur, tabla_real, columna):
            return f"{tabla_alias}.{columna} AS {out_alias}"
        return f"NULL AS {out_alias}"

    @classmethod
    def _campos_golpeos_select(cls, cur, alias: str = "g") -> str:
        fecha_expr = cls._expr_col(cur, alias, "golpes_futbol", "fecha_golpeo")
        if "AS fecha_golpeo" not in fecha_expr and cls._tiene_columna(cur, "golpes_futbol", "fecha"):
            fecha_expr = f"{alias}.fecha AS fecha_golpeo"
        base = [
            f"{alias}.id_golpeo",
            f"{alias}.id_usuario",
            f"{alias}.angulo_cadera_deg",
            f"{alias}.angulo_rodilla_deg",
            f"{alias}.angulo_tobillo_deg",
            f"{alias}.estabilidad_tronco",
            f"{alias}.pierna_golpeo",
            f"{alias}.pierna_apoyo",
            f"{alias}.confianza",
            fecha_expr,
        ]
        extras = [
            cls._expr_col(cur, alias, "golpes_futbol", "metodo_origen"),
            cls._expr_col(cur, alias, "golpes_futbol", "velocidad_pie_ms"),
            cls._expr_col(cur, alias, "golpes_futbol", "frame_impacto"),
            cls._expr_col(cur, alias, "golpes_futbol", "clasificacion"),
        ]
        return ", ".join(base + extras)

    def guardar_golpeo(self, id_usuario: int, data: dict, metodo_origen: str = "video_galeria") -> dict:
        payload = {
            "angulo_cadera_deg": normalizar_float(data.get("angulo_cadera_deg")),
            "angulo_rodilla_deg": normalizar_float(data.get("angulo_rodilla_deg")),
            "angulo_tobillo_deg": normalizar_float(data.get("angulo_tobillo_deg")),
            "estabilidad_tronco": normalizar_float(data.get("estabilidad_tronco")),
            "pierna_golpeo": data.get("pierna_golpeo") or "desconocida",
            "pierna_apoyo": data.get("pierna_apoyo") or "desconocida",
            "confianza": normalizar_float(data.get("confianza")),
            "metodo_origen": metodo_origen,
            "velocidad_pie_ms": normalizar_float(data.get("velocidad_pie_ms")),
            "frame_impacto": _safe_int(data.get("frame_impacto")),
            "clasificacion": data.get("clasificacion"),
            "curvas_json": data.get("curvas"),
            "alertas_json": data.get("alertas"),
            "landmarks_json": data.get("_landmarks_frames") or data.get("landmarks_frames"),
        }

        with get_connection() as (conn, cursor):
            fecha_col = "fecha_golpeo" if self._tiene_columna(cursor, "golpes_futbol", "fecha_golpeo") else "fecha"
            columnas = [
                "id_usuario",
                "angulo_cadera_deg",
                "angulo_rodilla_deg",
                "angulo_tobillo_deg",
                "estabilidad_tronco",
                "pierna_golpeo",
                "pierna_apoyo",
                "confianza",
                fecha_col,
            ]
            valores = [
                id_usuario,
                payload["angulo_cadera_deg"],
                payload["angulo_rodilla_deg"],
                payload["angulo_tobillo_deg"],
                payload["estabilidad_tronco"],
                payload["pierna_golpeo"],
                payload["pierna_apoyo"],
                payload["confianza"],
                datetime.now(),
            ]

            if self._tiene_columna(cursor, "golpes_futbol", "metodo_origen"):
                columnas.append("metodo_origen")
                valores.append(payload["metodo_origen"])

            # Columnas avanzadas (Fase analítica)
            for col, valor in [
                ("velocidad_pie_ms", payload["velocidad_pie_ms"]),
                ("frame_impacto", payload["frame_impacto"]),
                ("clasificacion", payload["clasificacion"]),
            ]:
                if self._tiene_columna(cursor, "golpes_futbol", col):
                    columnas.append(col)
                    valores.append(valor)

            for col, valor in [
                ("curvas_json", payload["curvas_json"]),
                ("alertas_json", payload["alertas_json"]),
                ("landmarks_json", payload["landmarks_json"]),
            ]:
                if valor is not None and self._tiene_columna(cursor, "golpes_futbol", col):
                    columnas.append(col)
                    try:
                        valores.append(json.dumps(valor, default=str))
                    except (TypeError, ValueError):
                        valores.append(None)

            cols_sql = ", ".join(columnas)
            placeholders = ", ".join(["%s"] * len(columnas))

            cursor.execute(
                f"INSERT INTO golpes_futbol ({cols_sql}) VALUES ({placeholders})",
                tuple(valores),
            )
            payload["id_golpeo"] = cursor.lastrowid

        # No devolver landmarks_json al caller (puede ser muy grande)
        payload.pop("landmarks_json", None)
        return payload

    def _obtener_columna_json(self, id_golpeo: int, columna: str):
        with get_connection() as (conn, cursor):
            if not self._tiene_columna(cursor, "golpes_futbol", columna):
                return None
            cursor.execute(
                f"SELECT {columna} FROM golpes_futbol WHERE id_golpeo = %s",
                (id_golpeo,),
            )
            row = cursor.fetchone()
            if not row:
                return None
            return _parse_json(row.get(columna))

    def obtener_curvas(self, id_golpeo: int) -> dict | None:
        return self._obtener_columna_json(id_golpeo, "curvas_json")

    def obtener_landmarks(self, id_golpeo: int) -> list | None:
        return self._obtener_columna_json(id_golpeo, "landmarks_json")

    def obtener_alertas(self, id_golpeo: int) -> list | None:
        return self._obtener_columna_json(id_golpeo, "alertas_json")

    def _listar_por_usuario(self, id_usuario: int, orden: str = "DESC") -> list[dict]:
        orden = "ASC" if str(orden).upper() == "ASC" else "DESC"
        with get_connection() as (conn, cursor):
            campos = self._campos_golpeos_select(cursor, alias="g")
            order_col = "g.fecha_golpeo" if self._tiene_columna(cursor, "golpes_futbol", "fecha_golpeo") else "g.fecha"
            cursor.execute(
                f"SELECT {campos} FROM golpes_futbol g "
                f"WHERE g.id_usuario = %s ORDER BY {order_col} {orden}",
                (id_usuario,),
            )
            return cursor.fetchall()

    def obtener_por_usuario_ordenado_asc(self, id_usuario: int) -> list[dict]:
        """Igual que obtener_por_usuario pero ordenado ASC para análisis temporal."""
        return self._listar_por_usuario(id_usuario, orden="ASC")

    def obtener_todos(self) -> list[dict]:
        with get_connection() as (conn, cursor):
            campos = self._campos_golpeos_select(cursor, alias="g")
            order_col = "g.fecha_golpeo" if self._tiene_columna(cursor, "golpes_futbol", "fecha_golpeo") else "g.fecha"
            cursor.execute(
                f"SELECT {campos} FROM golpes_futbol g ORDER BY {order_col} DESC"
            )
            return cursor.fetchall()

    def obtener_por_id(self, id_golpeo: int) -> dict | None:
        with get_connection() as (conn, cursor):
            campos = self._campos_golpeos_select(cursor, alias="g")
            cursor.execute(
                f"SELECT {campos} FROM golpes_futbol g WHERE g.id_golpeo = %s",
                (id_golpeo,),
            )
            return cursor.fetchone()

    def obtener_por_usuario(self, id_usuario: int) -> list[dict]:
        return self._listar_por_usuario(id_usuario, orden="DESC")

    def eliminar(self, id_golpeo: int) -> bool:
        with get_connection() as (conn, cursor):
            cursor.execute(
                "DELETE FROM golpes_futbol WHERE id_golpeo = %s",
                (id_golpeo,),
            )
            return cursor.rowcount > 0

    def obtener_videos_guardados(self, id_usuario: int | None = None) -> list[dict]:
        params: list = []
        where = ["g.video_blob IS NOT NULL"]

        if id_usuario is not None:
            where.append("g.id_usuario = %s")
            params.append(id_usuario)

        with get_connection() as (conn, cursor):
            order_col = "g.fecha_golpeo" if self._tiene_columna(cursor, "golpes_futbol", "fecha_golpeo") else "g.fecha"

            sql = (
                "SELECT g.id_golpeo, g.id_usuario, u.alias, u.nombre, g.pierna_golpeo, g.pierna_apoyo, "
                "g.angulo_rodilla_deg, g.angulo_cadera_deg, g.angulo_tobillo_deg, g.confianza, "
                f"g.metodo_origen, {order_col} AS fecha_golpeo, g.video_nombre, g.video_mime, "
                "LENGTH(g.video_blob) AS tamano_bytes "
                "FROM golpes_futbol g "
                "INNER JOIN usuarios_futbol u ON u.id = g.id_usuario "
                f"WHERE {' AND '.join(where)} "
                f"ORDER BY {order_col} DESC"
            )

            cursor.execute(sql, tuple(params))
            return cursor.fetchall()

    def obtener_video_por_id_golpeo(self, id_golpeo: int) -> dict | None:
        with get_connection() as (conn, cursor):
            fecha_expr = "fecha_golpeo" if self._tiene_columna(cursor, "golpes_futbol", "fecha_golpeo") else "fecha"
            cursor.execute(
                f"SELECT id_golpeo, id_usuario, {fecha_expr} AS fecha_golpeo, video_nombre, video_mime, video_blob "
                "FROM golpes_futbol WHERE id_golpeo = %s AND video_blob IS NOT NULL",
                (id_golpeo,),
            )
            return cursor.fetchone()

    def guardar_video_bd(
        self,
        id_golpeo: int,
        video_bytes: bytes,
        video_nombre: str | None,
        video_mime: str | None,
    ) -> bool:
        if not video_bytes:
            return False

        try:
            with get_connection() as (conn, cursor):
                cursor.execute(
                    "UPDATE golpes_futbol "
                    "SET video_blob = %s, video_nombre = %s, video_mime = %s "
                    "WHERE id_golpeo = %s",
                    (video_bytes, video_nombre, video_mime, id_golpeo),
                )
                return cursor.rowcount > 0
        except mysql.connector.Error as exc:
            logging.getLogger(__name__).warning("guardar_video_bd fallo: %s", exc)
            return False


# ── Helpers de modulo ──

def _safe_int(valor):
    if valor is None:
        return None
    try:
        return int(valor)
    except (TypeError, ValueError):
        return None


def _parse_json(raw):
    if raw is None:
        return None
    if isinstance(raw, (dict, list)):
        return raw
    if isinstance(raw, (bytes, bytearray)):
        try:
            raw = raw.decode("utf-8")
        except Exception:
            return None
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except (TypeError, ValueError):
            return None
    return None
