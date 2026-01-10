// =====================
// IMPORTS
// =====================
const fs = require('fs');
const path = require('path');
const https = require('https');
const unzipper = require('unzipper');
const express = require('express');
const basicAuth = require('basic-auth');

// =====================
// CONFIG
// =====================
const app = express();
const PORT = process.env.PORT || 3000;

const PUBLIC_DIR = path.join(__dirname, 'public_html');
const PRIVATE_DIR = path.join(__dirname, 'private_html');

const LASTED_ZIP = 'https://anarquist.ps.fhgdps.com/download/lasted.zip';
const PRIV_ZIP   = 'https://anarquist.ps.fhgdps.com/download/priv.zip';

// =====================
// CREAR CARPETAS
// =====================
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

ensureDir(PUBLIC_DIR);
ensureDir(PRIVATE_DIR);

// =====================
// DESCARGA + EXTRACCIÓN
// =====================
function downloadAndExtract(url, dest, name) {
  log(`Descargando ${name}...`);
  https.get(url, res => {
    res
      .pipe(unzipper.Extract({ path: dest }))
      .on('close', () => log(`${name} extraído correctamente`))
      .on('error', err => log(`ERROR ${name}: ${err.message}`));
  }).on('error', err => log(`ERROR descarga: ${err.message}`));
}

// =====================
// CONSOLA SSE
// =====================
let clients = [];

function log(msg) {
  const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
  console.log(line);
  clients.forEach(res => res.write(`data: ${line}\n\n`));
}

// =====================
// AUTH ADMIN
// =====================
if (!fs.existsSync('./key-node.key')) {
  console.error('FALTA key-node.key');
  process.exit(1);
}

const key = JSON.parse(fs.readFileSync('./key-node.key'));

function auth(req, res, next) {
  const creds = basicAuth(req);
  if (!creds || creds.name !== key.user || creds.pass !== key.password) {
    res.set('WWW-Authenticate', 'Basic realm="Neogrow Admin"');
    return res.status(401).send('Acceso denegado');
  }
  next();
}

// =====================
// RUTAS
// =====================
app.use(express.static(PUBLIC_DIR));

app.get('/admin/panel', auth, (req, res) => {
  res.sendFile(path.join(PRIVATE_DIR, 'panel.html'));
});

// Consola del servidor (read-only)
app.get('/admin/console', auth, (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  res.write('data: [SYSTEM] Consola conectada\n\n');
  clients.push(res);

  req.on('close', () => {
    clients = clients.filter(c => c !== res);
  });
});

// Apagar servidor
app.post('/admin/shutdown', auth, () => {
  log('Servidor apagándose...');
  setTimeout(() => process.exit(0), 1000);
});

// =====================
// INICIO SERVIDOR
// =====================
app.listen(PORT, () => {
  log('Neogrow Server iniciado');
  log('Generando estructura de carpetas');
  log('Cargando panel privado');

  downloadAndExtract(LASTED_ZIP, PUBLIC_DIR, 'lasted.zip');
  downloadAndExtract(PRIV_ZIP, PRIVATE_DIR, 'priv.zip');
});
