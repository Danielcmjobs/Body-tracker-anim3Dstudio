"""
Modelo para la gestion de usuarios del modulo de futbol.
"""

from models.db import get_connection


class UsuariosFutbolModel:

    def obtener_todos(self, paginado=False, search=None, limit=20, offset=0):
        query = (
            "SELECT id AS id_usuario, alias, nombre, fecha_creacion "
            "FROM usuarios_futbol"
        )
        params = []

        if search:
            query += " WHERE alias LIKE %s OR nombre LIKE %s"
            params.extend([f"%{search}%", f"%{search}%"])

        query += " ORDER BY fecha_creacion DESC"

        if paginado:
            query += " LIMIT %s OFFSET %s"
            params.extend([limit, offset])

        with get_connection() as (conn, cursor):
            cursor.execute(query, tuple(params))
            return cursor.fetchall()

    def obtener_por_id(self, id_usuario):
        query = (
            "SELECT id AS id_usuario, alias, nombre, fecha_creacion "
            "FROM usuarios_futbol WHERE id = %s"
        )
        with get_connection() as (conn, cursor):
            cursor.execute(query, (id_usuario,))
            return cursor.fetchone()

    def crear(self, data):
        columnas = ["alias", "nombre"]
        datos_filtrados = {k: v for k, v in data.items() if k in columnas}
        
        cols_sql = ", ".join(datos_filtrados.keys())
        placeholders = ", ".join(["%s"] * len(datos_filtrados))

        query = f"INSERT INTO usuarios_futbol ({cols_sql}) VALUES ({placeholders})"
        if not datos_filtrados:
            return None

        with get_connection() as (conn, cursor):
            cursor.execute(query, tuple(datos_filtrados.values()))
            return cursor.lastrowid

    def actualizar(self, id_usuario, data):
        columnas = ["alias", "nombre"]
        datos_filtrados = {k: v for k, v in data.items() if k in columnas}

        if not datos_filtrados:
            return 0

        set_sql = ", ".join([f"{k} = %s" for k in datos_filtrados.keys()])
        params = list(datos_filtrados.values())
        params.append(id_usuario)

        query = f"UPDATE usuarios_futbol SET {set_sql} WHERE id = %s"
        with get_connection() as (conn, cursor):
            cursor.execute(query, tuple(params))
            return cursor.rowcount

    def eliminar(self, id_usuario):
        query = "DELETE FROM usuarios_futbol WHERE id = %s"
        with get_connection() as (conn, cursor):
            cursor.execute(query, (id_usuario,))
            return cursor.rowcount

    def contar_total(self, search=None):
        query = "SELECT COUNT(*) AS total FROM usuarios_futbol"
        params = []
        if search:
            query += " WHERE alias LIKE %s OR nombre LIKE %s"
            params.extend([f"%{search}%", f"%{search}%"])

        with get_connection() as (conn, cursor):
            cursor.execute(query, tuple(params))
            row = cursor.fetchone() or {"total": 0}
            return int(row.get("total", 0))
