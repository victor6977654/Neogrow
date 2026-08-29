const http = require("http");
const WebSocket = require("ws");
const crypto = require("crypto");

const PORT = process.env.PORT || 10000;

// Token fijo
const TUNNEL_TOKEN = "RDXZ-9f82Kx7LmP4Qz81-TUNNEL";

const PUBLIC_URL = "https://neogrow.onrender.com";

let tunnel = null;

const pending = new Map();


// ===============================
// SERVIDOR HTTP PÚBLICO
// ===============================

const server = http.createServer((req, res) => {

    // PC desconectado
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


        tunnel.send(
            JSON.stringify({
                type: "request",
                id: id,
                method: req.method,
                url: req.url,
                headers: req.headers,
                body: body.toString("base64")
            }),
            error => {

                if (error) {

                    pending.delete(id);

                    if (!res.headersSent) {

                        res.writeHead(502, {
                            "Content-Type":
                                "text/plain; charset=utf-8"
                        });
                    }

                    res.end("Error en el túnel.\n");
                }
            }
        );
    });


    req.on("error", () => {
        pending.delete(id);
    });


    req.setTimeout(30000, () => {

        pending.delete(id);

        if (!res.headersSent) {

            res.writeHead(504, {
                "Content-Type":
                    "text/plain; charset=utf-8"
            });
        }

        res.end("Tiempo de espera agotado.\n");
    });

});


// ===============================
// SERVIDOR WSS
// ===============================

const wss = new WebSocket.Server({
    server: server,
    path: "/tunnel"
});


wss.on("connection", (ws, req) => {

    console.log("--------------------------------");
    console.log("Nueva conexión WSS");


    const token = req.headers["x-tunnel-token"];


    if (!token) {

        console.log("No se recibió token");

        ws.close(1008, "Token requerido");

        return;
    }


    if (token !== TUNNEL_TOKEN) {

        console.log("Token incorrecto");

        ws.close(1008, "Token incorrecto");

        return;
    }


    console.log("Token correcto");


    // Si ya había otro PC conectado
    if (
        tunnel &&
        tunnel.readyState === WebSocket.OPEN
    ) {

        console.log(
            "Cerrando túnel anterior"
        );

        tunnel.close(
            1000,
            "Nuevo túnel conectado"
        );
    }


    tunnel = ws;


    console.log("PC CONECTADO AL TÚNEL");
    console.log("--------------------------------");


    // ===============================
    // RESPUESTAS DEL PC
    // ===============================

    ws.on("message", data => {

        let message;


        try {

            message = JSON.parse(
                data.toString()
            );

        } catch (error) {

            console.log(
                "Mensaje JSON inválido"
            );

            return;
        }


        if (message.type !== "response") {
            return;
        }


        const res =
            pending.get(message.id);


        if (!res) {
            return;
        }


        pending.delete(message.id);


        // Copiar headers
        const headers = {
            ...(message.headers || {})
        };


        // Headers que no debemos reenviar
        delete headers.connection;
        delete headers["transfer-encoding"];


        // ===============================
        // CORREGIR REDIRECCIONES
        // ===============================

        if (headers.location) {

            let location =
                headers.location;


            // localhost
            if (
                location.indexOf(
                    "http://127.0.0.1"
                ) === 0
            ) {

                location =
                    location.replace(
                        "http://127.0.0.1",
                        PUBLIC_URL
                    );
            }


            else if (
                location.indexOf(
                    "https://127.0.0.1"
                ) === 0
            ) {

                location =
                    location.replace(
                        "https://127.0.0.1",
                        PUBLIC_URL
                    );
            }


            // localhost
            else if (
                location.indexOf(
                    "http://localhost"
                ) === 0
            ) {

                location =
                    location.replace(
                        "http://localhost",
                        PUBLIC_URL
                    );
            }


            else if (
                location.indexOf(
                    "https://localhost"
                ) === 0
            ) {

                location =
                    location.replace(
                        "https://localhost",
                        PUBLIC_URL
                    );
            }


            headers.location =
                location;


            console.log(
                "Location:",
                headers.location
            );
        }


        // ===============================
        // DEVOLVER RESPUESTA
        // ===============================

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


    // ===============================
    // DESCONEXIÓN
    // ===============================

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


            // Responder 503 a peticiones pendientes
            for (
                const [id, res]
                of pending
            ) {

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


    // ===============================
    // ERROR WSS
    // ===============================

    ws.on("error", error => {

        console.log(
            "ERROR WSS:",
            error.message
        );

    });

});


// ===============================
// INICIAR SERVIDOR
// ===============================

server.listen(PORT, () => {

    console.log(
        "================================"
    );

    console.log(
        "NEOGROW TUNNEL"
    );

    console.log(
        `Puerto: ${PORT}`
    );

    console.log(
        "WSS: /tunnel"
    );

    console.log(
        "================================"
    );

});
