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

const tunnels = new Map();

wss.on("connection", (ws, req) => {
    console.log("================================");
    console.log("[WSS] NUEVA CONEXION");

    const url = new URL(req.url, `http://${req.headers.host}`);
    const tunnelId = url.searchParams.get("id");

    console.log("[WSS] Tunnel ID:", tunnelId);
    console.log("[WSS] IP:", req.socket.remoteAddress);

    if (!tunnelId) {
        console.log("[WSS] ERROR: falta ID");
        ws.close(1008, "Missing tunnel ID");
        return;
    }

    if (!tunnels.has(tunnelId)) {
        tunnels.set(tunnelId, new Set());
    }

    const clients = tunnels.get(tunnelId);

    clients.add(ws);

    console.log(
        `[WSS] ${tunnelId} ahora tiene ${clients.size} conexiones`
    );

    ws.on("message", (data) => {
        console.log(
            `[WSS] ${tunnelId}: ${data.length} bytes`
        );

        for (const client of clients) {
            if (
                client !== ws &&
                client.readyState === 1
            ) {
                client.send(data);
            }
        }
    });

    ws.on("close", () => {
        clients.delete(ws);

        console.log(
            `[WSS] Desconectado ${tunnelId}. Restantes: ${clients.size}`
        );

        if (clients.size === 0) {
            tunnels.delete(tunnelId);
        }
    });

    ws.on("error", err => {
        console.log("[WSS] ERROR:", err.message);
    });
});

const PORT = process.env.PORT || 10000;

server.listen(PORT, "0.0.0.0", () => {
    console.log(`[HTTP] Relay escuchando en ${PORT}`);
    console.log("[HTTP] UDP ↔ WSS Tunnel Relay funcionando");
});
