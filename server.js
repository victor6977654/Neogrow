const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const bcrypt = require('bcrypt');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(bodyParser.json());
app.use(cookieParser());

// --- Base de datos en memoria ---
const usersDB = {};    // email -> {nombre, telefono, passwordHash}
const sessions = {};   // sessionId -> email

// --- Logs ---
if (!fs.existsSync('./user-logs')) fs.mkdirSync('./user-logs');
function createUserLog(nombre, telefono, passwordHash){
    const fname = `user-logs/user-${Math.random().toString(36).slice(2,9)}.log`;
    const content = `nombre: ${nombre}\ntelefono: ${telefono}\npassword_hash: ${passwordHash}\ncreated: ${new Date().toISOString()}\n`;
    fs.writeFileSync(fname, content);
    return fname;
}

// --- API Registro/Login ---
app.post('/api/register', async (req,res)=>{
    const { nombre, telefono, email, password } = req.body;
    if(!nombre || !telefono || !email || !password) return res.status(400).json({error:'Faltan campos'});
    if(usersDB[email]) return res.status(400).json({error:'Usuario ya existe'});

    const hash = await bcrypt.hash(password,10);
    usersDB[email] = { nombre, telefono, passwordHash: hash };
    createUserLog(nombre, telefono, hash);

    const sessionId = Math.random().toString(36).slice(2,16);
    sessions[sessionId] = email;
    res.cookie('sessionId', sessionId, { httpOnly:true });
    res.json({message:'Registrado con éxito', nombre, telefono});
});

app.post('/api/login', async (req,res)=>{
    const { email, password } = req.body;
    const user = usersDB[email];
    if(!user) return res.status(400).json({error:'Usuario no existe'});
    const match = await bcrypt.compare(password,user.passwordHash);
    if(!match) return res.status(401).json({error:'Contraseña incorrecta'});

    const sessionId = Math.random().toString(36).slice(2,16);
    sessions[sessionId] = email;
    res.cookie('sessionId', sessionId, { httpOnly:true });
    res.json({message:'Login exitoso', nombre: user.nombre, telefono: user.telefono});
});

app.post('/api/logout',(req,res)=>{
    const sessionId = req.cookies.sessionId;
    if(sessionId) delete sessions[sessionId];
    res.clearCookie('sessionId');
    res.json({message:'Logout exitoso'});
});

app.get('/api/session',(req,res)=>{
    const sessionId = req.cookies.sessionId;
    if(sessionId && sessions[sessionId]){
        const email = sessions[sessionId];
        const user = usersDB[email];
        return res.json({logged:true, nombre:user.nombre, telefono:user.telefono});
    }
    res.json({logged:false});
});

// --- Socket.IO para llamadas ---
let connectedUsers = {}; // telefono -> {socketId, nombre}

function updateUsersList(){
    const list = {};
    for(let t in connectedUsers){
        list[t] = {nombre: connectedUsers[t].nombre, online:true};
    }
    io.emit('update-users', list);
}

io.on('connection', socket => {
    socket.on('register-socket', ({telefono,nombre})=>{
        connectedUsers[telefono] = {socketId: socket.id, nombre};
        updateUsersList();
    });

    socket.on('call-user', ({from,to})=>{
        if(!connectedUsers[to]){
            socket.emit('call-blocked',{msg:'Usuario no disponible'});
            return;
        }
        io.to(connectedUsers[to].socketId).emit('incoming-call',{from});
    });

    socket.on('answer-call', ({from,to})=>{
        if(connectedUsers[to]){
            io.to(connectedUsers[to].socketId).emit('call-answered',{from});
        }
    });

    socket.on('signal', ({to,data})=>{
        if(connectedUsers[to]){
            io.to(connectedUsers[to].socketId).emit('signal', data);
        }
    });

    socket.on('disconnect', ()=>{
        for(let t in connectedUsers){
            if(connectedUsers[t].socketId === socket.id){
                delete connectedUsers[t];
                updateUsersList();
            }
        }
    });
});

// --- Página única (index) ---
app.get('/', (req,res)=>{
    res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>App de llamadas internas</title>
<style>
body{font-family:Arial,sans-serif;max-width:800px;margin:20px auto;}
.hidden{display:none;}
input{padding:6px;margin:4px 0;width:100%;}
button{padding:6px 12px;margin:6px 0;}
.user{display:flex;justify-content:space-between;align-items:center;padding:4px;border-bottom:1px solid #ccc;}
.status{width:12px;height:12px;border-radius:50%;margin-right:6px;}
.green{background:green;}
.gray{background:gray;}
#callModal{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;}
#callModal div{background:#fff;padding:20px;border-radius:8px;text-align:center;}
</style>
</head>
<body>

<h2>App de llamadas internas</h2>

<div id="auth">
<h3>Registro / Login</h3>
<input type="text" id="nombre" placeholder="Nombre">
<input type="text" id="telefono" placeholder="Número de teléfono">
<input type="email" id="email" placeholder="Correo electrónico">
<input type="password" id="password" placeholder="Contraseña">
<button id="registerBtn">Registrar</button>
<button id="loginBtn">Iniciar sesión</button>
</div>

<div id="usersPage" class="hidden">
<h3>Usuarios conectados</h3>
<div id="usersList"></div>
<button id="logoutBtn">Cerrar sesión</button>
</div>

<div id="callModal" class="hidden">
<div>
<h3 id="callTitle"></h3>
<button id="hangupBtn">Colgar</button>
</div>
</div>

<audio id="remoteAudio" autoplay></audio>

<script src="/socket.io/socket.io.js"></script>
<script>
const socket = io();
let localStream, pc;
let localUser=null;
let callingTo=null;

async function checkSession(){
    const res=await fetch('/api/session'); const data=await res.json();
    if(data.logged){ localUser={nombre:data.nombre,telefono:data.telefono}; showUsersPage();}
}
checkSession();

document.getElementById('registerBtn').onclick = async ()=>{
    const nombre=document.getElementById('nombre').value;
    const telefono=document.getElementById('telefono').value;
    const email=document.getElementById('email').value;
    const password=document.getElementById('password').value;
    const res=await fetch('/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nombre,telefono,email,password})});
    const j=await res.json();
    if(res.ok){ localUser={nombre,telefono}; showUsersPage(); alert('Registrado con éxito'); }
    else alert(j.error);
};

document.getElementById('loginBtn').onclick = async ()=>{
    const email=document.getElementById('email').value;
    const password=document.getElementById('password').value;
    const res=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
    const j=await res.json();
    if(res.ok){ localUser={nombre:j.nombre,telefono:j.telefono}; showUsersPage(); }
    else alert(j.error);
};

document.getElementById('logoutBtn').onclick = async ()=>{
    await fetch('/api/logout',{method:'POST'}); location.reload();
};

function showUsersPage(){
    document.getElementById('auth').classList.add('hidden');
    document.getElementById('usersPage').classList.remove('hidden');
    socket.emit('register-socket',{telefono:localUser.telefono,nombre:localUser.nombre});
}

let connectedUsers={};
socket.on('update-users', users=>{
    connectedUsers=users;
    const list=document.getElementById('usersList');
    list.innerHTML='';
    for(let t in users){
        const u=users[t];
        const div=document.createElement('div'); div.className='user';
        const status=document.createElement('span'); status.className='status '+(u.online?'green':'gray');
        const span=document.createElement('span'); span.textContent=\`\${u.nombre} (\${t})\`;
        const callBtn=document.createElement('button'); callBtn.textContent='Llamar';
        callBtn.onclick=()=>startCall(t,u.nombre);
        div.appendChild(status); div.appendChild(span); div.appendChild(callBtn);
        list.appendChild(div);
    }
});

async function ensureLocalStream(){ if(!localStream){ localStream=await navigator.mediaDevices.getUserMedia({audio:true,video:false}); } }

async function startCall(to,nombre){
    callingTo={telefono:to,nombre};
    document.getElementById('callTitle').textContent=\`Llamando a \${nombre} (\${to})...\`;
    document.getElementById('callModal').classList.remove('hidden');
    await ensureLocalStream();
    pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
    localStream.getTracks().forEach(t=>pc.addTrack(t,localStream));
    pc.ontrack=e=>document.getElementById('remoteAudio').srcObject=e.streams[0];
    pc.onicecandidate=e=>{ if(e.candidate) socket.emit('signal',{to,data:{type:'ice',candidate:e.candidate}}); };
    const offer=await pc.createOffer(); await pc.setLocalDescription(offer);
    socket.emit('call-user',{from:localUser.telefono,to});
    socket.emit('signal',{to,data:{type:'offer',sdp:offer}});
}

document.getElementById('hangupBtn').onclick = ()=>{
    if(pc){ pc.close(); pc=null; }
    document.getElementById('callModal').classList.add('hidden'); callingTo=null;
};

socket.on('signal', async data=>{
    if(data.type==='offer'){
        await ensureLocalStream();
        pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
        localStream.getTracks().forEach(t=>pc.addTrack(t,localStream));
        pc.ontrack=e=>document.getElementById('remoteAudio').srcObject=e.streams[0];
        pc.onicecandidate=e=>{ if(e.candidate) socket.emit('signal',{to:data.from,data:{type:'ice',candidate:e.candidate}}); };
        await pc.setRemoteDescription({type:'offer',sdp:data.sdp});
        const answer=await pc.createAnswer(); await pc.setLocalDescription(answer);
        socket.emit('signal',{to:data.from,data:{type:'answer',sdp:answer}});
        notify(\`Llamada de \${data.from}\`);
    }else if(data.type==='answer'){ await pc.setRemoteDescription({type:'answer',sdp:data.sdp}); }
    else if(data.type==='ice'){ try{ await pc.addIceCandidate(data.candidate); }catch(e){console.warn(e);} }
});

function notify(msg){
    if(Notification.permission==='granted'){ new Notification(msg); }
    else if(Notification.permission!=='denied'){ Notification.requestPermission().then(p=>{ if(p==='granted') new Notification(msg); }); }
}
</script>

</body>
</html>
    `);
});

// --- Puerto ---
const PORT = process.env.PORT || 3000;
server.listen(PORT,'0.0.0.0',()=>console.log(`Server running on port ${PORT}`));
