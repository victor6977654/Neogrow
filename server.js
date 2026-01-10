const fs = require("fs");
const path = require("path");
const express = require("express");
const unzipper = require("unzipper");

const app = express();

// Rutas
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public_html");
const ZIP_FILE = path.join(PUBLIC, "zip", "lasted.zip");
const DOWNLOAD_DIR = path.join(PUBLIC, "download");
const OFFLINE_FILE = path.join(DOWNLOAD_DIR, "eagle-offline.html");

// --- DESCOMPRIMIR SOLO SI NO EXISTE ---
async function unzipIfNeeded() {
  if (fs.existsSync(OFFLINE_FILE)) {
    console.log("✔ eagle-offline.html ya existe, no se descomprime");
    return;
  }

  if (!fs.existsSync(ZIP_FILE)) {
    console.error("❌ No existe public_html/zip/lasted.zip");
    return;
  }

  console.log("📦 Descomprimiendo lasted.zip...");

  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

  await fs.createReadStream(ZIP_FILE)
    .pipe(unzipper.Extract({ path: PUBLIC }))
    .promise();

  console.log("✅ eagle-offline.html extraído correctamente");
}

// --- ARRANQUE ---
(async () => {
  await unzipIfNeeded();

  // Servir todo public_html
  app.use(express.static(PUBLIC));

  // Página principal
  app.get("/", (req, res) => {
    res.sendFile(path.join(PUBLIC, "index.html"));
  });

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Servidor activo en 0.0.0.0:${PORT}`);
  });
})();
