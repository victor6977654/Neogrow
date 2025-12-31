const express = require("express");
const path = require("path");
const fs = require("fs-extra");
const ftp = require("basic-ftp");
const axios = require("axios");
const mime = require("mime-types");
const { Client } = require("ssh2");

const INFO_URL = "https://neogrow.unaux.com/files/node/info.json";

const BASE_DIR = __dirname;
const PUBLIC_DIR = path.join(BASE_DIR, "public");
const FILES_DIR = path.join(PUBLIC_DIR, "node-files");
const REGISTER_DIR = path.join(PUBLIC_DIR, "register");

const app = express();

/* ===============================
   CREAR CARPETAS NECESARIAS
================================ */
fs.ensureDirSync(FILES_DIR);
fs.ensureDirSync(REGISTER_DIR);

/* ===============================
   UTILIDADES
================================ */
function randomName() {
  return `${Math.floor(Math.random() * 99999)}-${new Date()
    .toISOString()
    .replace(/[:.]/g, "-")}.txt`;
}

async function saveLog(file, status) {
  const logFile = path.join(REGISTER_DIR, randomName());
  const content = `
Fecha: ${new Date().toString()}
Archivo: ${file}
Estado: ${status}
`;
  await fs.writeFile(logFile, content);
}

/* ===============================
   CARGAR INFO.JSON
================================ */
async function loadConfig() {
  const res = await axios.get(INFO_URL, { timeout: 10000 });
  return res.data;
}

/* ===============================
   TUNEL SSH (OPCIONAL)
================================ */
async function connectVPN(vpn) {
  return new Promise((resolve) => {
    try {
      const conn = new Client();
      conn
        .on("ready", () => {
          console.log("🔐 VPN SSH conectada");
          resolve(conn);
        })
        .on("error", () => {
          console.log("⚠️ VPN SSH falló, continuando sin VPN");
          resolve(null);
        })
        .connect({
          host: vpn.host,
          port: vpn.port,
          username: vpn.user,
          password: vpn.password,
        });
    } catch {
      resolve(null);
    }
  });
}

/* ===============================
   DESCARGA FTP
================================ */
async function downloadFromFTP(cfg, remotePath, localPath) {
  const client = new ftp.Client();
  client.ftp.verbose = false;

  try {
    await client.access({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
      secure: cfg.secure,
    });

    await fs.ensureDir(path.dirname(localPath));
    await client.downloadTo(localPath, remotePath);
    client.close();
  } catch (e) {
    client.close();
    throw e;
  }
}

/* ===============================
   RUTA /
================================ */
app.get("/", (req, res) => {
  req.url = "/index.html";
  app._router.handle(req, res);
});

/* ===============================
   RUTA GLOBAL
================================ */
app.get("*", async (req, res) => {
  let reqPath = req.path.replace(/^\/+/, "");

  if (!reqPath || reqPath === "") {
    reqPath = "index.html";
  }

  if (reqPath.includes("..")) {
    return res.status(403).send("Acceso denegado");
  }

  const localFile = path.join(FILES_DIR, reqPath);

  try {
    const config = await loadConfig();

    if (!config.License) {
      return res
        .status(503)
        .send("Servidor en mantenimiento (License=false)");
    }

    // cache
    if (await fs.pathExists(localFile)) {
      res.setHeader(
        "Content-Type",
        mime.lookup(localFile) || "application/octet-stream"
      );
      return res.sendFile(localFile);
    }

    // VPN opcional
    if (config.vpn === true) {
      await connectVPN(config.VPN);
    }

    const remoteFile = `/node-files/${reqPath}`;

    console.log(`⬇️ Descargando ${reqPath}`);
    await downloadFromFTP(config.FTP, remoteFile, localFile);

    await saveLog(reqPath, "DESCARGA_OK");

    res.setHeader(
      "Content-Type",
      mime.lookup(localFile) || "application/octet-stream"
    );
    return res.sendFile(localFile);
  } catch (err) {
    await saveLog(reqPath, "FALLO_DESCARGA");
    return res.status(404).send("404 - Archivo no encontrado");
  }
});

/* ===============================
   INICIAR SERVIDOR
================================ */
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server escuchando en 0.0.0.0:${PORT}`);
});
