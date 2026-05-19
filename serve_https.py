#!/usr/bin/env python3
"""
Servidor HTTPS simple para servir archivos estáticos con certificados auto-firmados.
"""

import http.server
import ssl
import os
import sys

# Configuración
PORT = 8443
CERT_FILE = os.path.join(os.path.dirname(__file__), 'certs', 'cert.pem')
KEY_FILE = os.path.join(os.path.dirname(__file__), 'certs', 'key.pem')
SERVE_DIR = os.path.join(os.path.dirname(__file__), 'integration', 'web')

# Validar certificados
if not os.path.exists(CERT_FILE) or not os.path.exists(KEY_FILE):
    print(f"[ERROR] Certificados no encontrados:")
    print(f"  - {CERT_FILE}")
    print(f"  - {KEY_FILE}")
    sys.exit(1)

# Cambiar directorio
os.chdir(SERVE_DIR)
print(f"[INFO] Sirviendo desde: {SERVE_DIR}")

# Crear handler
Handler = http.server.SimpleHTTPRequestHandler

# Crear servidor HTTPS
context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
context.load_cert_chain(CERT_FILE, KEY_FILE)
context.check_hostname = False
context.verify_mode = ssl.CERT_NONE

with http.server.HTTPServer(("0.0.0.0", PORT), Handler) as httpd:
    httpd.socket = context.wrap_socket(httpd.socket, server_side=True)
    print(f"[INFO] Frontend HTTPS disponible en:")
    print(f"  - https://localhost:{PORT}/futbol.html")
    print(f"  - https://192.168.1.17:{PORT}/futbol.html")
    print(f"[INFO] Presiona CTRL+C para detener")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[INFO] Servidor detenido")
