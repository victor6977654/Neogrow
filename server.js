const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_DIR = path.join(__dirname, "data");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

app.use(bodyParser.json({ limit: "10mb" }));
app.use(express.static("public"));
app.use("/data", express.static("data"));

// ✔ Sincroniza solo los archivos faltantes desde PHP
async function syncFiles() {
  try {
    const { data: fileList } = await axios.get(
      "https://pelermore.unaux.com/proyect-node/down.php"
    );

    if (!Array.isArray(fileList)) return;

    for (const file of fileList) {
      const filePath = path.join(DATA_DIR, file);

      if (!fs.existsSync(filePath)) {
        console.log("Descargando:", file);

        const res = await axios.get(
          "https://pelermore.unaux.com/proyect-node/down.php?file=" + file,
          { responseType: "arraybuffer" }
        );
        fs.writeFileSync(filePath, res.data);
      }
    }
  } catch(e) {
    console.log("Sincronización fallida:", e.message);
  }
}

syncFiles();

// API crear proyecto
app.post("/api/proyecto", async (req, res) => {
  const { nombre, descripcion, contenido } = req.body;

  if (!nombre || !contenido)
    return res.json({ error: "Nombre y contenido requeridos" });

  const fileName = nombre.replace(/[^a-zA-Z0-9]/gi, "_").toLowerCase() + ".html";
  const filePath = path.join(DATA_DIR, fileName);

  fs.writeFileSync(filePath, contenido);

  try {
    await axios.post("https://pelermore.unaux.com/proyect-node/up.php", {
      nombre: fileName,
      descripcion,
      contenido
    });
  } catch (e) {
    console.log("Error subiendo a PHP:", e.message);
  }

  res.json({ success: true, file: fileName });
});

// API lista proyectos
app.get("/api/listar", (req, res) => {
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith(".html"));
  res.json(files);
});

app.listen(PORT, "0.0.0.0", () =>
  console.log(`Servidor listo en 0.0.0.0:${PORT}`)
);
