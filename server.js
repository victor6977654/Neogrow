const http = require("http");
const express = require("express");
const { WebSocketServer } = require("ws");

const app = express();

app.get("/", (req, res) => {
    res.send("UDP ↔ WSS Tunnel Relay funcionando");
});

const server = http.createServer(app);

const wss = new WebSocketServer({
    server,
    path: "/tunnel"
});

// tunnel_id -> conexiones
const tunnels = new Map();

wss.on("connection", (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const tunnelId = url.searchParams.get("id");

    if (!tunnelId) {
        ws.close(1008, "Missing tunnel ID");
        return;
    }

    console.log(`[+] Conexión: ${tunnelId}`);

    if (!tunnels.has(tunnelId)) {
        tunnels.set(tunnelId, new Set());
    }

    const clients = tunnels.get(tunnelId);
    clients.add(ws);

    ws.on("message", (data, isBinary) => {
        // Reenviar el paquete al otro extremo
        for (const client of clients) {
            if (client !== ws && client.readyState === 1) {
                client.send(data, { binary: isBinary });
            }
        }
    });

    ws.on("close", () => {
        clients.delete(ws);

        console.log(`[-] Desconectado: ${tunnelId}`);

        if (clients.size === 0) {
            tunnels.delete(tunnelId);
        }
    });

    ws.on("error", err => {
        console.error(`[WS ERROR] ${err.message}`);
    });
});

const PORT = process.env.PORT || 10000;

server.listen(PORT, "0.0.0.0", () => {
    console.log(`Relay escuchando en puerto ${PORT}`);
});
