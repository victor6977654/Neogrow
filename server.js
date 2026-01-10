const fs = require("fs");
const path = require("path");
const https = require("https");
const express = require("express");
const unzipper = require("unzipper");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

/* ===============================
   CONFIGURACIÓN BÁSICA
================================ */

const PUBLIC_USER = "admin";
const PUBLIC_PASS = "admin123";

/* Semilla interna (NO es la key) */
const SERVER_CORE_SEED =
"NEOGROW_INTERNAL_NODE_CORE_2026_X9A";

/* Rutas */
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public_html");
const PRIVATE_DIR = path.join(ROOT, "private_html");
const KEY_PATH = path.join(ROOT, "key-node.key");

/* Zips */
const LASTED_ZIP = "https://anarquist.ps.fhgdps.com/download/lasted.zip";
const PRIV_ZIP   = "https://anarquist.ps.fhgdps.com/download/priv.zip";

/* ===============================
   UTILIDADES
================================ */

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  clients.forEach(res => res.write(`data: ${line}\n\n`));
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, res => {
      res.pipe(file);
      file.on("finish", () => file.close(resolve));
    }).on("error", reject);
  });
}

function unzip(zip, dest) {
  return fs.createReadStream(zip)
    .pipe(unzipper.Extract({ path: dest }))
    .promise();
}

/* ===============================
   VALIDACIÓN DE KEY (EXTENSIÓN)
================================ */

function validateKey(key) {
  if (!key || !key.id || !key.signature) return false;

  const base =
    key.id +
    key.nonce +
    SERVER_CORE_SEED;

  const hash = crypto
    .createHash("sha256")
    .update(base)
    .digest("hex");

  return hash.startsWith(key.signature);
}

/* ===============================
   ARRANQUE
================================ */

(async () => {
  ensureDir(PUBLIC_DIR);
  ensureDir(PRIVATE_DIR);

  if (!fs.existsSync(path.join(PUBLIC_DIR, "lasted"))) {
    log("Descargando lasted.zip");
    await download(LASTED_ZIP, "lasted.zip");
    await unzip("lasted.zip", PUBLIC_DIR);
    fs.unlinkSync("lasted.zip");
    log("lasted.zip listo");
  }

  if (!fs.existsSync(path.join(PRIVATE_DIR, "index.html"))) {
    log("Descargando priv.zip");
    await download(PRIV_ZIP, "priv.zip");
    await unzip("priv.zip", ROOT);
    fs.unlinkSync("priv.zip");
    log("priv.zip listo");
  }

  log("Servidor iniciado correctamente");
})();

/* ===============================
   MIDDLEWARE
================================ */

app.use(express.json());
app.use(express.static(PUBLIC_DIR));

/* ===============================
   AUTH SIMPLE
================================ */

function basicAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).end();

  const [user, pass] = Buffer
    .from(auth.split(" ")[1], "base64")
    .toString()
    .split(":");

  if (user !== PUBLIC_USER || pass !== PUBLIC_PASS)
    return res.status(403).end();

  next();
}

/* ===============================
   ADMIN PANEL
================================ */

app.use("/admin/panel", basicAuth, (req, res) => {
  if (!fs.existsSync(KEY_PATH))
    return res.status(403).send("Key no encontrada");

  const key = JSON.parse(fs.readFileSync(KEY_PATH));
  if (!validateKey(key))
    return res.status(403).send("Key inválida");

  res.sendFile(path.join(PRIVATE_DIR, "index.html"));
});

/* ===============================
   CONSOLA (SSE)
================================ */

let clients = [];

app.get("/admin/console", basicAuth, (req, res) => {
  if (!fs.existsSync(KEY_PATH)) return res.end();

  const key = JSON.parse(fs.readFileSync(KEY_PATH));
  if (!validateKey(key)) return res.end();

  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive"
  });

  clients.push(res);
  req.on("close", () => {
    clients = clients.filter(c => c !== res);
  });
});

/* ===============================
   APAGAR SERVIDOR
================================ */

app.post("/admin/shutdown", basicAuth, (req, res) => {
  if (!fs.existsSync(KEY_PATH)) return res.end();

  const key = JSON.parse(fs.readFileSync(KEY_PATH));
  if (!validateKey(key)) return res.end();

  log("Servidor apagado por admin");
  res.end("OK");
  process.exit(0);
});

/* ===============================
   START
================================ */

app.listen(PORT, () => {
  log(`Servidor escuchando en puerto ${PORT}`);
});
