const http = require("http");
const WebSocket = require("ws");
const crypto = require("crypto");

const PORT = process.env.PORT || 10000;
const TUNNEL_TOKEN = "RDXZ-9f82Kx7LmP4Qz81-TUNNEL";

let tunnel = null;
const pending = new Map();

const server = http.createServer((req, res) => {
    if (!tunnel || tunnel.readyState !== WebSocket.OPEN) {
        res.writeHead(503, {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store"
        });

        return res.end(
            "Web no disponible, inténtalo más tarde.\n"
        );
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
        }), err => {
            if (err) {
                pending.delete(id);

                if (!res.headersSent) {
                    res.writeHead(502, {
                        "Content-Type":
                            "text/plain; charset=utf-8"
                    });
                }

                res.end("Error en el túnel.\n");
            }
        });
    });

    req.on("error", () => {
        pending.delete(id);
    });
});


const wss = new WebSocket.Server({
    server,
    path: "/tunnel"
});


wss.on("connection", (ws, req) => {

    console.log("================================");
    console.log("Nueva conexión WSS");
    console.log("IP:", req.socket.remoteAddress);
    console.log("Token recibido:",
        req.headers["x-tunnel-token"]
            ? "SI"
            : "NO"
    );
    console.log("Token configurado:",
        TUNNEL_TOKEN
            ? "SI"
            : "NO"
    );
    console.log("================================");


    const token = req.headers["x-tunnel-token"];

    if (!TUNNEL_TOKEN) {
        console.log("ERROR: TUNNEL_TOKEN no configurado");
        ws.close(1011, "Server token missing");
        return;
    }


    if (token !== TUNNEL_TOKEN) {
        console.log("ERROR: token incorrecto");

        ws.close(1008, "Unauthorized");
        return;
    }


    console.log("TOKEN CORRECTO");


    if (tunnel && tunnel.readyState === WebSocket.OPEN) {
        console.log("Cerrando túnel anterior");
        tunnel.close(1000, "New tunnel");
    }


    tunnel = ws;

    console.log("PC CONECTADO AL TUNEL");


    ws.on("message", data => {

        let message;

        try {
            message = JSON.parse(data.toString());
        } catch {
            console.log("Mensaje JSON inválido");
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


        const headers = {
            ...(message.headers || {})
        };


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


    ws.on("close", (code, reason) => {

        console.log(
            "PC DESCONECTADO",
            "code:",
            code,
            "reason:",
            reason.toString()
        );


        if (tunnel === ws) {
            tunnel = null;


            for (const [id, res] of pending) {

                if (!res.headersSent) {
                    res.writeHead(503, {
                        "Content-Type":
                            "text/plain; charset=utf-8"
                    });
                }

                res.end(
                    "Web no disponible, inténtalo más tarde.\n"
                );
            }


            pending.clear();
        }
    });


    ws.on("error", err => {
        console.log(
            "ERROR WSS:",
            err.message
        );
    });
});


server.listen(PORT, () => {
    console.log(
        `Servidor escuchando en puerto ${PORT}`
    );
});
