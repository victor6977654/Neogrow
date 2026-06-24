const express = require("express");
const http = require("http");
const path = require("path");
const cookieParser = require("cookie-parser");
const { Server } = require("socket.io");
const ftp = require("basic-ftp");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

/* =========================
   MIDDLEWARES
========================= */
app.use(express.json());
app.use(cookieParser());

/* =========================
   FRONTEND /public
========================= */
app.use(express.static(path.join(__dirname, "public")));

/* FIX: ROOT PAGE */
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "login.html"));
});

/* =========================
   FTP LOCAL STORAGE
========================= */
const USERS_DIR = path.join(__dirname, "users");
const PFP_DIR = path.join(__dirname, "pfp");

/* =========================
   MEMORIA TEMPORAL
========================= */
const onlineUsers = {};   // id -> socket.id
const calls = {};         // token -> call data
const sessions = {};      // cookie sessions

/* =========================
   FTP SYNC
========================= */
async function syncFTP() {
    const client = new ftp.Client();
    client.ftp.verbose = false;

    try {
        await client.access({
            host: "ftpupload.net",
            user: "b24_40085255",
            password: "victorgamer34",
            secure: false
        });

        await fs.promises.mkdir(USERS_DIR, { recursive: true });
        await fs.promises.mkdir(PFP_DIR, { recursive: true });

        await client.downloadToDir(USERS_DIR, "htdocs/users");
        await client.downloadToDir(PFP_DIR, "htdocs/pfp");

        console.log("✔ FTP sincronizado");
    } catch (err) {
        console.log("✖ FTP error:", err.message);
    }

    client.close();
}

/* =========================
   BUSCAR USER POR ID
========================= */
function getUserById(id) {

    if (!fs.existsSync(USERS_DIR)) return null;

    const files = fs.readdirSync(USERS_DIR);

    for (const file of files) {
        try {
            const user = JSON.parse(
                fs.readFileSync(path.join(USERS_DIR, file))
            );

            if (String(user.id) === String(id)) {
                return user;
            }
        } catch {}
    }

    return null;
}

/* =========================
   LOGIN
========================= */
app.post("/login", (req, res) => {

    const { id, pass } = req.body;

    const user = getUserById(id);

    if (!user) {
        return res.json({ ok: false, msg: "Usuario no existe" });
    }

    if (user.pass !== pass) {
        return res.json({ ok: false, msg: "Contraseña incorrecta" });
    }

    const sessionId = crypto.randomBytes(16).toString("hex");

    sessions[sessionId] = {
        id: user.id,
        user: user.user,
        pfp: user.pfp,
        admin: user.admin || 0
    };

    res.cookie("neo_session", sessionId, {
        maxAge: 1000 * 60 * 60 * 24 * 7
    });

    return res.json({
        ok: true,
        user: sessions[sessionId]
    });
});

/* =========================
   SOCKET.IO CORE
========================= */
io.on("connection", (socket) => {

    /* registrar usuario online */
    socket.on("register", (id) => {
        onlineUsers[id] = socket.id;
        socket.userId = id;
    });

    /* =========================
       LLAMAR USUARIO
    ========================== */
    socket.on("call-user", ({ to }) => {

        const from = socket.userId;
        const token = crypto.randomBytes(8).toString("hex");

        calls[token] = { from, to };

        const targetSocket = onlineUsers[to];

        if (!targetSocket) return;

        const caller = getUserById(from);

        io.to(targetSocket).emit("incoming-call", {
            from,
            token,
            user: caller?.user || from,
            pfp: caller?.pfp || `/pfp/${from}.jpg`
        });
    });

    /* =========================
       ACEPTAR LLAMADA
    ========================== */
    socket.on("accept-call", ({ token, answer }) => {

        const call = calls[token];
        if (!call) return;

        const callerSocket = onlineUsers[call.from];

        if (callerSocket) {
            io.to(callerSocket).emit("call-accepted", {
                token,
                answer
            });
        }
    });

    /* =========================
       RECHAZAR LLAMADA
    ========================== */
    socket.on("reject-call", ({ token }) => {

        const call = calls[token];
        if (!call) return;

        const callerSocket = onlineUsers[call.from];

        if (callerSocket) {
            io.to(callerSocket).emit("call-rejected");
        }

        delete calls[token];
    });

    /* ICE (WEBRTC READY) */
    socket.on("ice-candidate", ({ to, candidate }) => {

        const target = onlineUsers[to];

        if (target) {
            io.to(target).emit("ice-candidate", {
                candidate
            });
        }
    });

    /* desconexión */
    socket.on("disconnect", () => {
        if (socket.userId) {
            delete onlineUsers[socket.userId];
        }
    });
});

/* =========================
   START SERVER
========================= */
const PORT = process.env.PORT || 3000;

server.listen(PORT, async () => {
    console.log("🚀 NeoGrow ON PORT " + PORT);

    await syncFTP();

    setInterval(syncFTP, 60000);
});
