const express = require('express');
const setupWebDAV = require('./webdav');

const app = express();
const HTDOCS_DIR = __dirname + '/htdocs';

// Servir archivos estáticos
app.use(express.static(HTDOCS_DIR));

// Integrar WebDAV
setupWebDAV(app, HTDOCS_DIR);

// Puerto asignado por Render
const PORT = process.env.PORT;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor HTTP + WebDAV activo en http://0.0.0.0:${PORT}`);
});
