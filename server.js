import http from "http";
import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import crypto from "crypto";

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 10000;

const SYNC_PORT = 4021;
const HEARTBEAT_MS = 30_000;
const NODE_TIMEOUT_MS = 90_000;

const nodes = new Map();
const webRequests = new Map();

let requestCounter = 0;

// ---------------------------------------------------------
// UTILIDADES
// ---------------------------------------------------------

function send(ws, data) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        return false;
    }

    try {
        ws.send(JSON.stringify(data));
        return true;
    } catch {
        return false;
    }
}

function newId(prefix = "id") {
    return `${prefix}-${Date.now().toString(36)}-${crypto
        .randomBytes(5)
        .toString("hex")}`;
}

function validPriority(value) {
    const n = Number(value);
    return Number.isInteger(n) && n >= 0 && n <= 100;
}

// ---------------------------------------------------------
// RED
// ---------------------------------------------------------

function ipToNumbers(ip) {
    if (typeof ip !== "string") return null;

    const p = ip.split(".");

    if (p.length !== 4) return null;

    const n = p.map(Number);

    if (n.some(x => !Number.isInteger(x) || x < 0 || x > 255)) {
        return null;
    }

    return n;
}

function calculateNetwork(ip, mask) {
    const a = ipToNumbers(ip);
    const m = ipToNumbers(mask);

    if (!a || !m) return null;

    return a.map((v, i) => v & m[i]).join(".");
}

function sameNetwork(a, b) {
    return Boolean(
        a &&
        b &&
        a.network &&
        b.network &&
        a.network === b.network
    );
}

// ---------------------------------------------------------
// NODOS
// ---------------------------------------------------------

function activeNode(node) {
    return (
        node &&
        node.ws &&
        node.ws.readyState === WebSocket.OPEN
    );
}

function getHighestPriorityNode() {
    let result = null;

    for (const node of nodes.values()) {
        if (!activeNode(node)) continue;

        if (
            !result ||
            node.priority > result.priority ||
            (
                node.priority === result.priority &&
                node.connectedAt < result.connectedAt
            )
        ) {
            result = node;
        }
    }

    return result;
}

function getHighestPriorityInNetwork(network) {
    let result = null;

    for (const node of nodes.values()) {
        if (!activeNode(node)) continue;
        if (node.network !== network) continue;

        if (
            !result ||
            node.priority > result.priority ||
            (
                node.priority === result.priority &&
                node.connectedAt < result.connectedAt
            )
        ) {
            result = node;
        }
    }

    return result;
}

function registerNode(ws, msg) {
    const nodeId = String(msg.nodeId || "").trim();

    if (!nodeId) {
        send(ws, {
            type: "ERROR",
            code: "INVALID_NODE_ID"
        });

        ws.close(1008);
        return null;
    }

    const priority = Number(msg.priority);

    if (!validPriority(priority)) {
        send(ws, {
            type: "ERROR",
            code: "INVALID_PRIORITY",
            message: "priority must be between 0 and 100"
        });

        ws.close(1008);
        return null;
    }

    const privateIp =
        typeof msg.privateIp === "string"
            ? msg.privateIp
            : null;

    const subnet =
        typeof msg.subnet === "string"
            ? msg.subnet
            : null;

    const network =
        calculateNetwork(
            privateIp,
            subnet
        );

    const old = nodes.get(nodeId);

    if (old?.ws && old.ws !== ws) {
        try {
            old.ws.close(
                1000,
                "Node reconnected"
            );
        } catch {}
    }

    const node = {
        nodeId,
        priority,
        privateIp,
        subnet,
        network,

        hostname:
            msg.hostname || null,

        platform:
            msg.platform || null,

        ws,

        connectedAt: Date.now(),
        lastSeen: Date.now()
    };

    nodes.set(nodeId, node);

    console.log(
        `[NODE] ONLINE ${nodeId} ` +
        `priority=${priority} ` +
        `ip=${privateIp || "?"} ` +
        `network=${network || "?"}`
    );

    send(ws, {
        type: "WELCOME",
        nodeId,
        priority,
        syncPort: SYNC_PORT,
        serverTime: Date.now()
    });

    return node;
}

// ---------------------------------------------------------
// RUTA DE SINCRONIZACIÓN
// ---------------------------------------------------------

function chooseSyncRoute(source, target) {
    if (!source || !target) {
        return "unavailable";
    }

    if (sameNetwork(source, target)) {
        return "local";
    }

    return "relay";
}

function announceSyncTarget(node) {
    const coordinator =
        getHighestPriorityInNetwork(node.network);

    if (!coordinator) {
        return;
    }

    if (coordinator.nodeId === node.nodeId) {
        return;
    }

    const route =
        chooseSyncRoute(
            node,
            coordinator
        );

    if (route === "local") {
        send(node.ws, {
            type: "SYNC_LOCAL",
            coordinator: {
                nodeId: coordinator.nodeId,
                priority: coordinator.priority,
                privateIp: coordinator.privateIp,
                port: SYNC_PORT
            },
            interval: 30 * 60 * 1000
        });

        return;
    }

    send(node.ws, {
        type: "SYNC_REMOTE",
        coordinator: {
            nodeId: coordinator.nodeId,
            priority: coordinator.priority
        }
    });
}

// ---------------------------------------------------------
// RELAY
// ---------------------------------------------------------

function relay(source, msg) {
    const targetId = msg.target;

    if (!targetId) {
        send(source.ws, {
            type: "ERROR",
            code: "MISSING_TARGET"
        });

        return;
    }

    const target = nodes.get(targetId);

    if (!activeNode(target)) {
        send(source.ws, {
            type: "RELAY_ERROR",
            code: "TARGET_OFFLINE",
            target: targetId
        });

        return;
    }

    send(target.ws, {
        type: "RELAY",
        source: source.nodeId,
        sessionId: msg.sessionId || null,
        payload: msg.payload ?? null
    });
}

// ---------------------------------------------------------
// WEB PROXY
// ---------------------------------------------------------

function chooseWebNode() {
    return getHighestPriorityNode();
}

function handleWebRequest(req, res) {
    const node = chooseWebNode();

    if (!node) {
        res.status(503).send(`
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>503 - NeoGrow</title>
<style>
body {
    font-family: Arial, sans-serif;
    text-align: center;
    margin-top: 15vh;
}
h1 {
    font-size: 34px;
}
</style>
</head>
<body>
<h1>ERROR 503</h1>
<p>LA WEB ACTUALMENTE NO ESTÁ DISPONIBLE</p>
<p>INTÉNTELO MÁS TARDE</p>
</body>
</html>
        `);

        return;
    }

    const id =
        `web-${++requestCounter}-${crypto
            .randomBytes(4)
            .toString("hex")}`;

    const chunks = [];

    req.on("data", chunk => {
        chunks.push(chunk);
    });

    req.on("end", () => {
        const body =
            Buffer.concat(chunks);

        webRequests.set(id, {
            res,
            createdAt: Date.now()
        });

        const message = {
            type: "WEB_REQUEST",

            id,

            method: req.method,

            path:
                req.originalUrl,

            headers: req.headers,

            body:
                body.length
                    ? body.toString("base64")
                    : null
        };

        if (!send(node.ws, message)) {
            webRequests.delete(id);

            if (!res.headersSent) {
                res.status(503).send(
                    "NeoGrow node unavailable"
                );
            }
        }
    });

    req.on("error", () => {
        webRequests.delete(id);

        if (!res.headersSent) {
            res.status(500).end();
        }
    });
}

// Todas las rutas HTTP van al nodo.
app.use((req, res) => {
    handleWebRequest(req, res);
});

// ---------------------------------------------------------
// WEBSOCKET
// ---------------------------------------------------------

const wss = new WebSocketServer({
    server,
    path: "/tunnel"
});

wss.on("connection", (ws, req) => {
    let node = null;
    let registered = false;

    console.log(
        `[WS] connection ${req.socket.remoteAddress}`
    );

    const timeout = setTimeout(() => {
        if (!registered) {
            ws.close(
                1008,
                "Registration required"
            );
        }
    }, 10_000);

    ws.on("message", raw => {
        let msg;

        try {
            msg =
                JSON.parse(
                    raw.toString()
                );
        } catch {
            send(ws, {
                type: "ERROR",
                code: "INVALID_JSON"
            });

            return;
        }

        // -------------------------------------------------
        // REGISTER
        // -------------------------------------------------

        if (msg.type === "REGISTER") {
            if (registered) {
                send(ws, {
                    type: "ERROR",
                    code: "ALREADY_REGISTERED"
                });

                return;
            }

            node =
                registerNode(
                    ws,
                    msg
                );

            if (!node) return;

            registered = true;

            clearTimeout(timeout);

            announceSyncTarget(node);

            return;
        }

        if (!registered || !node) {
            send(ws, {
                type: "ERROR",
                code: "NOT_REGISTERED"
            });

            return;
        }

        node.lastSeen = Date.now();

        // -------------------------------------------------
        // PING
        // -------------------------------------------------

        if (msg.type === "PONG") {
            return;
        }

        if (msg.type === "PING") {
            send(ws, {
                type: "PONG",
                time: Date.now()
            });

            return;
        }

        // -------------------------------------------------
        // STATUS
        // -------------------------------------------------

        if (msg.type === "STATUS") {
            if (msg.privateIp) {
                node.privateIp =
                    msg.privateIp;
            }

            if (msg.subnet) {
                node.subnet =
                    msg.subnet;
            }

            node.network =
                calculateNetwork(
                    node.privateIp,
                    node.subnet
                );

            return;
        }

        // -------------------------------------------------
        // WEB RESPONSE
        // -------------------------------------------------

        if (msg.type === "WEB_RESPONSE") {
            const pending =
                webRequests.get(msg.id);

            if (!pending) return;

            webRequests.delete(msg.id);

            const res = pending.res;

            if (res.headersSent) {
                return;
            }

            const status =
                Number(msg.status) || 200;

            res.status(status);

            if (msg.headers) {
                for (const [key, value] of Object.entries(msg.headers)) {
                    const lower =
                        key.toLowerCase();

                    // Evitamos headers peligrosos para el proxy.
                    if (
                        lower === "connection" ||
                        lower === "transfer-encoding" ||
                        lower === "content-length"
                    ) {
                        continue;
                    }

                    try {
                        res.setHeader(
                            key,
                            value
                        );
                    } catch {}
                }
            }

            if (msg.body) {
                res.end(
                    Buffer.from(
                        msg.body,
                        "base64"
                    )
                );
            } else {
                res.end();
            }

            return;
        }

        // -------------------------------------------------
        // RELAY
        // -------------------------------------------------

        if (msg.type === "RELAY") {
            relay(node, msg);
            return;
        }

        // -------------------------------------------------
        // SYNC REMOTO
        // -------------------------------------------------

        if (msg.type === "SYNC_REMOTE") {
            const target =
                nodes.get(msg.target);

            if (!activeNode(target)) {
                send(ws, {
                    type: "SYNC_ERROR",
                    code: "TARGET_OFFLINE"
                });

                return;
            }

            send(target.ws, {
                type: "SYNC_REMOTE",
                source: node.nodeId,
                sessionId:
                    msg.sessionId || null,
                payload:
                    msg.payload ?? null
            });

            return;
        }

        // -------------------------------------------------
        // SOLICITAR SYNC
        // -------------------------------------------------

        if (msg.type === "REQUEST_SYNC") {
            announceSyncTarget(node);
            return;
        }

        // -------------------------------------------------
        // SYNC ACK
        // -------------------------------------------------

        if (msg.type === "SYNC_ACK") {
            const target =
                nodes.get(msg.target);

            if (!activeNode(target)) {
                return;
            }

            send(target.ws, {
                type: "SYNC_ACK",
                source: node.nodeId,
                sessionId:
                    msg.sessionId || null,
                payload:
                    msg.payload ?? null
            });

            return;
        }

        // -------------------------------------------------
        // SYNC DATA
        // -------------------------------------------------

        if (msg.type === "SYNC_DATA") {
            const target =
                nodes.get(msg.target);

            if (!activeNode(target)) {
                return;
            }

            send(target.ws, {
                type: "SYNC_DATA",
                source: node.nodeId,
                sessionId:
                    msg.sessionId || null,
                payload:
                    msg.payload ?? null
            });

            return;
        }

        send(ws, {
            type: "ERROR",
            code: "UNKNOWN_MESSAGE",
            messageType: msg.type
        });
    });

    ws.on("close", () => {
        clearTimeout(timeout);

        if (!node) return;

        const current =
            nodes.get(node.nodeId);

        if (
            current &&
            current.ws === ws
        ) {
            nodes.delete(
                node.nodeId
            );

            console.log(
                `[NODE] OFFLINE ${node.nodeId}`
            );
        }
    });

    ws.on("error", err => {
        console.error(
            `[WS] ${err.message}`
        );
    });
});

// ---------------------------------------------------------
// HEARTBEAT
// ---------------------------------------------------------

setInterval(() => {
    const now = Date.now();

    for (const [id, node] of nodes) {
        if (
            now - node.lastSeen >
            NODE_TIMEOUT_MS
        ) {
            console.log(
                `[NODE] TIMEOUT ${id}`
            );

            try {
                node.ws.close(
                    1000,
                    "Timeout"
                );
            } catch {}

            nodes.delete(id);

            continue;
        }

        send(node.ws, {
            type: "PING",
            time: now
        });
    }
}, HEARTBEAT_INTERVAL);

// ---------------------------------------------------------
// LIMPIAR PETICIONES HTTP ABANDONADAS
// ---------------------------------------------------------

setInterval(() => {
    const now = Date.now();

    for (const [id, request] of webRequests) {
        if (
            now - request.createdAt >
            120_000
        ) {
            webRequests.delete(id);

            if (!request.res.headersSent) {
                request.res.status(504).end(
                    "Gateway timeout"
                );
            }
        }
    }
}, 30_000);

// ---------------------------------------------------------
// API DE ESTADO
// ---------------------------------------------------------

app.get("/health", (req, res) => {
    const primary =
        getHighestPriorityNode();

    res.json({
        status: "online",

        nodes: nodes.size,

        primary:
            primary?.nodeId || null,

        primaryPriority:
            primary?.priority ?? null,

        uptime:
            process.uptime(),

        timestamp:
            Date.now()
    });
});

app.get("/nodes", (req, res) => {
    const result = [];

    for (const node of nodes.values()) {
        result.push({
            nodeId: node.nodeId,
            priority: node.priority,
            privateIp: node.privateIp,
            subnet: node.subnet,
            network: node.network,
            platform: node.platform,
            hostname: node.hostname,
            lastSeen: node.lastSeen
        });
    }

    result.sort(
        (a, b) =>
            b.priority - a.priority
    );

    res.json(result);
});

// ---------------------------------------------------------
// START
// ---------------------------------------------------------

server.listen(
    PORT,
    () => {
        console.log(
            `NeoGrow Render Gateway listening on ${PORT}`
        );

        console.log(
            `Web: HTTPS`
        );

        console.log(
            `Tunnel: WSS /tunnel`
        );

        console.log(
            `LAN sync: TCP ${SYNC_PORT}`
        );
    }
);
