"""
MODEL — Acceso a datos de la tabla `usuarios`.
"""

from models.db import get_connection


class UsuarioModel:
    """CRUD para la tabla usuarios."""

    def obtener_todos(self) -> list[dict]:
        with get_connection() as (conn, cur):
            cur.execute(
                "SELECT id_usuario, alias, nombre_completo, altura_m, fecha_registro "
                "FROM usuarios ORDER BY fecha_registro DESC"
            )
            return cur.fetchall()

    def obtener_por_id(self, id_usuario: int) -> dict | None:
        with get_connection() as (conn, cur):
            cur.execute(
                "SELECT id_usuario, alias, nombre_completo, altura_m, fecha_registro "
                "FROM usuarios WHERE id_usuario = %s",
                (id_usuario,),
            )
            return cur.fetchone()

    def crear(self, alias: str, nombre_completo: str, altura_m: float) -> int:
        with get_connection() as (conn, cur):
            cur.execute(
                "INSERT INTO usuarios (alias, nombre_completo, altura_m) "
                "VALUES (%s, %s, %s)",
                (alias, nombre_completo, altura_m),
            )
            return cur.lastrowid

    def actualizar(self, id_usuario: int, alias: str, nombre_completo: str, altura_m: float) -> bool:
        with get_connection() as (conn, cur):
            cur.execute(
                "UPDATE usuarios SET alias = %s, nombre_completo = %s, altura_m = %s "
                "WHERE id_usuario = %s",
                (alias, nombre_completo, altura_m, id_usuario),
            )
            return cur.rowcount > 0

    def eliminar(self, id_usuario: int) -> bool:
        with get_connection() as (conn, cur):
            cur.execute(
                "DELETE FROM usuarios WHERE id_usuario = %s",
                (id_usuario,),
            )
            return cur.rowcount > 0
