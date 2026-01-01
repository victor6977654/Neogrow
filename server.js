import express from "express";
import compression from "compression";
import path from "path";
import { fileURLToPath } from "url";

const app = express();

// Render / host define el puerto automáticamente
const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

// Para __dirname en ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🔥 Compresión gzip / brotli
app.use(compression());

// ⚡ Cache agresivo para archivos estáticos
app.use(
  "/public",
  express.static(path.join(__dirname, "public"), {
    maxAge: "1y",
    immutable: true,
    etag: false
  })
);

// 🚀 Index servido directo y rápido
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"), {
    headers: {
      "Cache-Control": "no-store"
    }
  });
});

// ❌ 404 ligero
app.use((req, res) => {
  res.status(404).send("404 Not Found");
});

// 🟢 Start
app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});
