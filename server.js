const express = require("express");
const ftp = require("basic-ftp");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

// FTP CONFIG
const FTP_HOST = "ftpupload.net";
const FTP_USER = "ezyro_40763847";
const FTP_PASSWORD = "rdxz55";
const FTP_PHP_DIR = "/htdocs/php"; // PHP ejecutable en hosting

// Carpeta local permanente
const NODE_DIR = path.join(__dirname, "node");

// Servir archivos estáticos (HTML, CSS, JS)
app.use(express.static(NODE_DIR));

// Función para subir PHP a FTP
async function uploadPHP(filename) {
    const client = new ftp.Client();
    client.ftp.verbose = false;
    try {
        await client.access({
            host: FTP_HOST,
            user: FTP_USER,
            password: FTP_PASSWORD,
            secure: false,
        });

        const localPath = path.join(NODE_DIR, filename);
        const remotePath = path.join(FTP_PHP_DIR, filename);

        await client.uploadFrom(localPath, remotePath);
        console.log(`PHP subido a FTP: ${filename}`);

        // Programar eliminación después de 30 minutos (1800000 ms)
        setTimeout(async () => {
            try {
                await client.remove(remotePath);
                console.log(`PHP eliminado de FTP tras 30min: ${filename}`);
            } catch (err) {
                console.error(`Error eliminando PHP: ${err.message}`);
            }
        }, 1800000);

    } catch (err) {
        console.error(`Error subiendo PHP: ${err.message}`);
        throw err;
    } finally {
        client.close();
    }
}

// Endpoint para ejecutar PHP temporal
app.get("/*.php", async (req, res) => {
    const filename = path.basename(req.path);
    const localPath = path.join(NODE_DIR, filename);

    // Verificar si existe en /node
    if (!fs.existsSync(localPath)) {
        return res.status(404).send("Archivo PHP no encontrado en Node");
    }

    try {
        // Subir PHP a FTP
        await uploadPHP(filename);

        // Hacer request al PHP ejecutable en tu hosting
        const phpUrl = `https://neogrow.unaux.com/php/${filename}`;
        const response = await axios.get(phpUrl);

        // Devolver HTML generado al cliente
        res.send(response.data);

    } catch (err) {
        res.status(500).send("Error ejecutando PHP: " + err.message);
    }
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor Node corriendo en http://0.0.0.0:${PORT}`);
});
