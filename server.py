import os
from wsgidav.wsgidav_app import WsgiDAVApp
from wsgidav.fs_dav_provider import FilesystemProvider

# Carpeta de archivos
HTDOCS_DIR = os.path.join(os.path.dirname(__file__), "htdocs")
os.makedirs(HTDOCS_DIR, exist_ok=True)

# Usuario y contraseña
USUARIO = "co"
PASSWORD = "12345"

# Configuración WsgiDAV
config = {
    "provider_mapping": {"/": FilesystemProvider(HTDOCS_DIR)},
    "simple_dc": {"user_mapping": {USUARIO: PASSWORD}},
    "verbose": 1,
    "dir_browser": {"enable": True},  # permite ver los archivos en navegador
    "http_authenticator": {
        "domain_controller": None,
        "accept_basic": True,
        "accept_digest": False,
    },
}

# Esto es lo que Gunicorn necesita: la app WSGI
app = WsgiDAVApp(config)0
