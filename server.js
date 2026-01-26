const fs = require("fs");
const path = require("path");
const express = require("express");
const unzipper = require("unzipper");
const axios = require("axios");

const app = express();

// --- RUTAS ---
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

// --- PROXY PARA ARCHIVOS PHP ---
app.all("/*.php", async (req, res) => {
  try {
    // Construir URL hacia el servidor PHP
    const phpUrl = `https://neogrow.unaux.com${req.path}${req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""}`;
    
    // Configuración de axios para GET o POST
    const axiosConfig = {
      method: req.method,
      url: phpUrl,
      headers: { ...req.headers, host: "neogrow.unaux.com" },
      responseType: "arraybuffer", // Mantener binarios si hay imágenes, etc.
    };

    if (req.method === "POST") {
      axiosConfig.data = req.body;
    }

    const response = await axios(axiosConfig);

    // Devolver al navegador el contenido tal cual lo envía PHP
    res.set("Content-Type", response.headers["content-type"]);
    res.status(response.status).send(response.data);

  } catch (err) {
    console.error("❌ Error proxy PHP:", err.message);
    res.status(500).send("Error procesando PHP");
  }
});

// --- SERVIR ARCHIVOS ESTÁTICOS ---
app.use(express.static(PUBLIC));

app.get("/", (req, res) => {
  res.sendFile(path.join(PUBLIC, "index.html"));
});

// --- ARRANQUE ---
(async () => {
  await unzipIfNeeded();

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Servidor Node.js activo en 0.0.0.0:${PORT}`);
  });
})();
