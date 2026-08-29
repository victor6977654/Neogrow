const http = require("http");
const WebSocket = require("ws");
const crypto = require("crypto");

const PORT = process.env.PORT || 10000;
const TUNNEL_TOKEN = process.env.TUNNEL_TOKEN;

let tunnel = null;
const pending = new Map();

const server = http.createServer((req, res) => {
    if (!tunnel || tunnel.readyState !== WebSocket.OPEN) {
        res.writeHead(503, {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store"
        });

        return res.end("Web no disponible, inténtalo más tarde.\n");
    }

    const id = crypto.randomUUID();

    const chunks = [];

    req.on("data", chunk => {
        chunks.push(chunk);
    });

    req.on("end", () => {
        const body = Buffer.concat(chunks);

        pending.set(id, res);

        tunnel.send(JSON.stringify({
            type: "request",
            id,
            method: req.method,
            url: req.url,
            headers: req.headers,
            body: body.toString("base64")
        }), error => {
            if (error) {
                pending.delete(id);

                if (!res.headersSent) {
                    res.writeHead(502, {
                        "Content-Type": "text/plain; charset=utf-8"
                    });
                }

                res.end("Error en el túnel.\n");
            }
        });
    });

    req.on("error", () => {
        pending.delete(id);
    });

    // Evita conexiones HTTP colgadas indefinidamente
    req.setTimeout(30000, () => {
        pending.delete(id);

        if (!res.headersSent) {
            res.writeHead(504, {
                "Content-Type": "text/plain; charset=utf-8"
            });
        }

        res.end("Tiempo de espera agotado.\n");
    });
});


const wss = new WebSocket.Server({
    server,
    path: "/tunnel"
});


wss.on("connection", (ws, req) => {
    const token = req.headers["x-tunnel-token"];

    if (!TUNNEL_TOKEN || token !== TUNNEL_TOKEN) {
        console.log("Intento de conexión no autorizado");

        ws.close(1008, "Unauthorized");
        return;
    }

    // Solo permitimos un PC conectado a la vez
    if (tunnel && tunnel.readyState === WebSocket.OPEN) {
        tunnel.close(1000, "Replaced by new tunnel");
    }

    tunnel = ws;

    console.log("PC conectado al túnel");


    ws.on("message", data => {
        let message;

        try {
            message = JSON.parse(data.toString());
        } catch {
            return;
        }

        if (message.type !== "response") {
            return;
        }

        const res = pending.get(message.id);

        if (!res) {
            return;
        }

        pending.delete(message.id);

        const headers = message.headers || {};

        // Evitar headers problemáticos enviados por el proxy
        delete headers.connection;
        delete headers["transfer-encoding"];

        res.writeHead(
            message.statusCode || 502,
            headers
        );

        const body = Buffer.from(
            message.body || "",
            "base64"
        );

        res.end(body);
    });


    ws.on("close", () => {
        if (tunnel === ws) {
            tunnel = null;
            console.log("PC desconectado");

            // Liberar peticiones pendientes
            for (const [id, res] of pending) {
                if (!res.headersSent) {
                    res.writeHead(503, {
                        "Content-Type": "text/plain; charset=utf-8"
                    });
                }

                res.end("Web no disponible, inténtalo más tarde.\n");
            }

            pending.clear();
        }
    });


    ws.on("error", error => {
        console.log("Error WSS:", error.message);
    });
});


server.listen(PORT, () => {
    console.log(`Render tunnel escuchando en puerto ${PORT}`);
});
