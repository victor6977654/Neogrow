const { v2: webdav } = require('webdav-server');

function setupWebDAV(app, htdocsDir) {
    const webdavServer = new webdav.WebDAVServer({
        rootFileSystem: new webdav.PhysicalFileSystem(htdocsDir)
    });

    // Crear un usuario y contraseña
    webdavServer.userManager.addUser('admin', '1234', false); // usuario: admin, pass: 1234

    // Middleware que detecta métodos WebDAV
    app.use((req, res, next) => {
        const webdavMethods = [
            'PROPFIND', 'PROPPATCH', 'MKCOL', 'COPY',
            'MOVE', 'LOCK', 'UNLOCK', 'PUT', 'DELETE'
        ];

        if (webdavMethods.includes(req.method)) {
            // Autenticación básica
            webdavServer.httpAuthentication(req, res, () => {
                webdavServer.handleRequest(req, res);
            });
        } else {
            next();
        }
    });
}

module.exports = setupWebDAV;
