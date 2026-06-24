const express = require("express");
const http = require("http");
const cookieParser = require("cookie-parser");
const { Server } = require("socket.io");
const ftp = require("basic-ftp");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

app.use(express.json());
app.use(cookieParser());

/* =========================
   CONFIG FTP
========================= */
const FTP_CONFIG = {
    host: "ftpupload.net",
    user: "b24_40085255",
    password: "victorgamer34",
    secure: false
};

const LOCAL_USERS = path.join(__dirname, "users");
const LOCAL_PFP = path.join(__dirname, "pfp");

/* =========================
   MEMORIA TEMPORAL
========================= */
const onlineUsers = {};   // id -> socket.id
const activeCalls = {};   // token -> call data
const sessions = {};      // cookie sessions

/* =========================
   FTP SYNC
========================= */
async function syncFTP() {
    const client = new ftp.Client();
    client.ftp.verbose = false;

    try {
        await client.access(FTP_CONFIG);

        await fs.promises.mkdir(LOCAL_USERS, { recursive: true });
        await fs.promises.mkdir(LOCAL_PFP, { recursive: true });

        await client.downloadToDir(LOCAL_USERS, "htdocs/users");
        await client.downloadToDir(LOCAL_PFP, "htdocs/pfp");

        console.log("FTP sincronizado");
    } catch (err) {
        console.log("Error FTP:", err.message);
    }

    client.close();
}

/* =========================
   USER HELPERS
========================= */
function getUserById(id) {
    if (!fs.existsSync(LOCAL_USERS)) return null;

    const files = fs.readdirSync(LOCAL_USERS);

    for (const f of files) {
        try {
            const user = JSON.parse(
                fs.readFileSync(path.join(LOCAL_USERS, f))
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
        created: Date.now()
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
   SOCKET.IO
========================= */
io.on("connection", (socket) => {

    /* registrar usuario online */
    socket.on("register", (id) => {
        onlineUsers[id] = socket.id;
        socket.userId = id;
    });

    /* =========================
       INICIAR LLAMADA
    ========================== */
    socket.on("call-user", ({ to }) => {

        const from = socket.userId;
        const token = crypto.randomBytes(8).toString("hex");

        activeCalls[token] = { from, to };

        const target = onlineUsers[to];

        if (!target) return;

        const caller = getUserById(from);

        io.to(target).emit("incoming-call", {
            from,
            token,
            pfp: caller?.pfp || null,
            user: caller?.user || from
        });
    });

    /* =========================
       ACEPTAR LLAMADA
       (WEBRTC SIGNALING)
    ========================== */
    socket.on("accept-call", ({ token, answer }) => {

        const call = activeCalls[token];
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
       ICE CANDIDATES
    ========================== */
    socket.on("ice-candidate", ({ to, candidate }) => {

        const target = onlineUsers[to];

        if (target) {
            io.to(target).emit("ice-candidate", {
                candidate
            });
        }
    });

    /* =========================
       RECHAZAR
    ========================== */
    socket.on("reject-call", ({ token }) => {

        const call = activeCalls[token];
        if (!call) return;

        const callerSocket = onlineUsers[call.from];

        if (callerSocket) {
            io.to(callerSocket).emit("call-rejected");
        }

        delete activeCalls[token];
    });

    socket.on("disconnect", () => {
        if (socket.userId) {
            delete onlineUsers[socket.userId];
        }
    });
});

/* =========================
   START + FTP LOOP
========================= */
const PORT = process.env.PORT || 3000;

server.listen(PORT, async () => {

    console.log("NeoGrow activo en puerto " + PORT);

    await syncFTP();

    // sync cada 60s (por si FTP cambia)
    setInterval(syncFTP, 60000);
});
