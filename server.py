import os
from wsgidav.wsgidav_app import WsgiDAVApp
from wsgidav.server.run_server import run
from wsgidav.fs_dav_provider import FilesystemProvider

# Carpeta de archivos
HTDOCS_DIR = os.path.join(os.path.dirname(__file__), "htdocs")
os.makedirs(HTDOCS_DIR, exist_ok=True)

# Puerto asignado por Render
PORT = int(os.environ.get("PORT", 8000))

# Usuario y contraseña
USUARIO = "co"
PASSWORD = "12345"

# Configuración WsgiDAV
config = {
    "host": "0.0.0.0",
    "port": PORT,
    "provider_mapping": {"/": FilesystemProvider(HTDOCS_DIR)},
    "simple_dc": {"user_mapping": {USUARIO: PASSWORD}},  # usuario y password
    "verbose": 1,
    "dir_browser": {"enable": True},  # navegador web para ver archivos
    "http_authenticator": {
        "domain_controller": None,  # usa simple_dc
        "accept_basic": True,       # acepta Basic Auth
        "accept_digest": False,
    },
}

app = WsgiDAVApp(config)

if __name__ == "__main__":
    print(f"Servidor WebDAV/HTTP listo en http://0.0.0.0:{PORT}/")
    print(f"Usuario: {USUARIO}, Password: {PASSWORD}")
    run(app, host="0.0.0.0", port=PORT)
