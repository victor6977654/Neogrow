const express = require("express");
const axios = require("axios");
const WebSocket = require("ws");

const app = express();
app.use(express.json());
app.use(express.static("public"));

const REMOTE_SUBMIT = "https://pelermore.unaux.com/proyecto-nodejs/submit-d.php";
const REMOTE_LIST = "https://pelermore.unaux.com/proyecto-nodejs/list-lotes.php";

let MESSAGES = [];
let BATCH_ID = 1;
let lastUp = 0, lastDown = 0;

// WebSockets
const server = app.listen(process.env.PORT || 3000, "0.0.0.0", () => {
  console.log("🟢 Servidor online");
  restoreFromRemote();
});

const wss = new WebSocket.Server({ server });

// ---------------- RESTAURAR LOTES ----------------
async function restoreFromRemote() {
  try {
    const res = await axios.get(REMOTE_LIST);
    const files = res.data.files || [];

    console.log("📥 Restaurando lotes:", files.length);

    for (const file of files) {
      const lote = await axios.get(
        `https://pelermore.unaux.com/proyecto-nodejs/${file}`
      );
      MESSAGES.push(...lote.data.messages);
      BATCH_ID = Math.max(BATCH_ID, lote.data.batch + 1);
      console.log(`🔄 Restaurado ${file}`);
    }

    console.log("✔ Restauración completa");

  } catch (err) {
    console.log("⚠ Error restaurando:", err.message);
  }
}

// ---------------- SUBIR LOTES ----------------
async function submitBatch() {
  const payload = {
    batch: BATCH_ID,
    messages: [...MESSAGES]
  };

  try {
    const res = await axios.post(REMOTE_SUBMIT, payload);
    lastUp = res.data.upSpeed || 0;
    lastDown = res.data.downSpeed || 0;

    broadcast({
      type: "speed",
      up: lastUp.toFixed(2),
      down: lastDown.toFixed(2)
    });

    console.log(`📤 Subido lote ${BATCH_ID}`);
    MESSAGES = [];
    BATCH_ID++;

  } catch (e) {
    console.log("❌ Falló subida lote");
  }
}

// ---------------- CHAT ----------------
app.post("/message", (req, res) => {
  const msg = {
    text: req.body.text,
    time: Date.now()
  };

  MESSAGES.push(msg);
  broadcast({ type: "message", msg });

  if (MESSAGES.length >= 10) submitBatch();

  res.json({ status: "ok" });
});

// Broadcast WS
function broadcast(data) {
  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify(data));
  });
}
