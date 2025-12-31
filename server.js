const express = require("express");
const ftp = require("basic-ftp");
const fs = require("fs-extra");
const path = require("path");
const axios = require("axios");
const mime = require("mime-types");
const { Client } = require("ssh2");

const app = express();
const HOST = "0.0.0.0";
const PORT = process.env.PORT || 3000;

const INFO_URL = "https://neogrow.unaux.com/files/node/info.json";

const BASE_DIR = path.join(__dirname, "public");
const FILES_DIR = path.join(BASE_DIR, "node-files");
const LOG_DIR = path.join(BASE_DIR, "register");

let CONFIG = null;

// Crear carpetas
fs.ensureDirSync(FILES_DIR);
fs.ensureDirSync(LOG_DIR);

/* ------------------ CARGAR CONFIG ------------------ */
async function loadConfig() {
  const res = await axios.get(INFO_URL, { timeout: 8000 });
  return res.data;
}

/* ------------------ VPN SSH ------------------ */
function startVPN(vpn) {
  return new Promise((resolve, reject) => {
    const conn = new Client();

    conn.on("ready", () => {
      conn.forwardIn("127.0.0.1", 2121, err => {
        if (err) return reject(err);
        console.log("🔐 VPN SSH activa");
        resolve();
      });
    });

    conn.on("tcp connection", (info, accept) => {
      const stream = accept();
      conn.forwardOut(
        info.srcIP,
        info.srcPort,
        "127.0.0.1",
        21,
        (err, upstream) => {
          if (err) return;
          stream.pipe(upstream);
          upstream.pipe(stream);
        }
      );
    });

    conn.connect({
      host: vpn.host,
      port: vpn.port,
      username: vpn.user,
      password: vpn.password
    });
  });
}

/* ------------------ REGISTRO ------------------ */
async function saveLog(file, ip, status) {
  const now = new Date();
  const stamp = `${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}-${now.getSeconds()}`;
  const rand = Math.floor(Math.random() * 1000000);

  const logFile = path.join(LOG_DIR, `${rand}-${stamp}.txt`);

  const content = `
Archivo: ${file}
Fecha: ${now.toLocaleDateString()}
Hora: ${now.toLocaleTimeString()}
IP: ${ip}
Estado: ${status}
`;

  await fs.writeFile(logFile, content.trim());
}

/* ------------------ DESCARGA FTP ------------------ */
async function downloadFromFTP(remoteFile, localFile) {
  const client = new ftp.Client();
  let downloaded = 0;
  let last = 0;

  await fs.ensureDir(path.dirname(localFile));
  await client.access(CONFIG.ftp);

  client.trackProgress(info => downloaded = info.bytesOverall);

  const interval = setInterval(() => {
    const speed = (downloaded - last) / 1024;
    last = downloaded;
    process.stdout.write(`\r⬆️ 0.0 kb/s ⬇️ ${speed.toFixed(1)} kb/s`);
  }, 1000);

  await client.downloadTo(localFile, remoteFile);

  clearInterval(interval);
  process.stdout.write("\r⬆️ 0.0 kb/s ⬇️ 0.0 kb/s\n");
  client.close();
}

/* ------------------ ROUTER ------------------ */
app.get("*", async (req, res) => {
  const reqPath = req.path.replace(/^\/+/, "");
  if (!reqPath) return res.status(400).end();

  const localFile = path.join(FILES_DIR, reqPath);
  const remoteFile = `${CONFIG.ftp.baseDir}/${reqPath}`;

  // Ya existe
  if (await fs.pathExists(localFile)) {
    return res.sendFile(localFile);
  }

  // Descargar
  try {
    console.log(`⬇️ Descargando ${remoteFile}`);
    await downloadFromFTP(remoteFile, localFile);
    await saveLog(reqPath, req.ip, "DESCARGA_OK");

    res.setHeader(
      "Content-Type",
      mime.lookup(localFile) || "application/octet-stream"
    );
    return res.sendFile(localFile);

  } catch (err) {
    await saveLog(reqPath, req.ip, "FALLO / NO EXISTE");
    return res.status(404).send("404 - Archivo no encontrado");
  }
});

/* ------------------ START ------------------ */
async function start() {
  try {
    CONFIG = await loadConfig();
    console.log("📄 info.json cargado");
  } catch {
    app.get("*", (_, res) => res.send("Servidor en mantenimiento"));
    return app.listen(PORT, HOST);
  }

  if (!CONFIG.license) {
    app.get("*", (_, res) => res.send("Servidor en mantenimiento"));
    return app.listen(PORT, HOST);
  }

  if (CONFIG.vpn === true) {
    await startVPN(CONFIG.vpnConfig);
    CONFIG.ftp.host = "127.0.0.1";
    CONFIG.ftp.port = 2121;
  }

  app.listen(PORT, HOST, () => {
    console.log(`🌍 Server activo en ${HOST}:${PORT}`);
  });
}

start();
