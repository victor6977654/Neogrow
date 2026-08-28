const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 10000;

let tunnel = null;

const server = http.createServer((req, res) => {
    if (!tunnel || tunnel.readyState !== WebSocket.OPEN) {
        res.writeHead(503, {
            "Content-Type": "text/plain; charset=utf-8"
        });
        return res.end("Web no disponible, inténtalo más tarde.\n");
    }

    const request = {
        type: "http",
        method: req.method,
        url: req.url,
        headers: req.headers
    };

    let body = [];

    req.on("data", chunk => body.push(chunk));

    req.on("end", () => {
        request.body = Buffer.concat(body).toString("base64");

        tunnel.send(JSON.stringify(request));
    });
});

const wss = new WebSocket.Server({
    server,
    path: "/tunnel"
});

wss.on("connection", (ws, req) => {
    // Autenticación sencilla mediante token
    const token = req.headers["x-tunnel-token"];

    if (token !== process.env.TUNNEL_TOKEN) {
        ws.close(1008, "Unauthorized");
        return;
    }

    if (tunnel && tunnel.readyState === WebSocket.OPEN) {
        tunnel.close();
    }

    tunnel = ws;

    console.log("Túnel conectado");

    ws.on("close", () => {
        if (tunnel === ws) {
            tunnel = null;
            console.log("Túnel desconectado");
        }
    });
});

server.listen(PORT, () => {
    console.log(`Tunnel server escuchando en ${PORT}`);
});
