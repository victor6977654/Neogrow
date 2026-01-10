const fs = require("fs");
const path = require("path");
const https = require("https");
const express = require("express");
const unzipper = require("unzipper");

const app = express();
const PORT = process.env.PORT || 3000;

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public_html");
const LASTED_DIR = path.join(PUBLIC_DIR, "lasted");

const LASTED_ZIP_URL =
  "https://anarquist.ps.fhgdps.com/download/lasted.zip";

/* ===============================
   UTILIDADES
================================ */

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function downloadZip(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, res => {
      if (res.statusCode !== 200) {
        reject(new Error("Error HTTP " + res.statusCode));
        return;
      }
      res.pipe(file);
      file.on("finish", () => file.close(resolve));
    }).on("error", reject);
  });
}

function unzip(zipPath, dest) {
  return fs
    .createReadStream(zipPath)
    .pipe(unzipper.Extract({ path: dest }))
    .promise();
}

/* ===============================
   INICIALIZACIÓN
================================ */

(async () => {
  try {
    ensureDir(PUBLIC_DIR);

    if (!fs.existsSync(LASTED_DIR)) {
      console.log("Descargando lasted.zip...");
      await downloadZip(LASTED_ZIP_URL, "lasted.zip");

      console.log("Descomprimiendo lasted.zip...");
      await unzip("lasted.zip", PUBLIC_DIR);

      fs.unlinkSync("lasted.zip");
      console.log("lasted.zip listo");
    } else {
      console.log("lasted ya existe, no se descarga");
    }
  } catch (err) {
    console.error("ERROR INIT:", err.message);
    // NO se cae el servidor
  }
})();

/* ===============================
   SERVIDOR WEB
================================ */

app.use(express.static(PUBLIC_DIR));

app.get("/", (req, res) => {
  res.redirect("/lasted/index.html");
});

app.listen(PORT, () => {
  console.log("Servidor activo en puerto", PORT);
});
