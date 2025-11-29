const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// Carpeta pública para servir call.html y otros assets
app.use(express.static(path.join(__dirname, 'public')));

// Guardar usuarios conectados { telefono: {socketId, ip} }
let users = {};

io.on('connection', socket => {
  const clientIP = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;

  // Registrar usuario
  socket.on('register', ({ telefono }) => {
    users[telefono] = { socketId: socket.id, ip: clientIP };
    console.log(`[REGISTER] ${telefono} - ${clientIP}`);
  });

  // Iniciar llamada
  socket.on('call-user', ({ from, to }) => {
    const callerIP = clientIP;
    if (!users[to]) {
      socket.emit('call-blocked', { msg: 'Usuario no disponible' });
      return;
    }
    // Validación IP para seguridad extremo a extremo
    if (users[to].ip !== callerIP) {
      socket.emit('call-blocked', { msg: 'Se protegió la llamada de extremo a extremo' });
      return;
    }
    // Emitir llamada entrante al destinatario
    io.to(users[to].socketId).emit('incoming-call', { from });
    console.log(`[CALL] ${from} -> ${to}`);
  });

  // Responder llamada
  socket.on('answer-call', ({ from, to }) => {
    if (users[to]) {
      io.to(users[to].socketId).emit('call-answered', { from });
    }
  });

  // Mensajes dentro de la llamada
  socket.on('signal', ({ to, data }) => {
    if (users[to]) {
      io.to(users[to].socketId).emit('signal', data);
    }
  });

  // Desconexión
  socket.on('disconnect', () => {
    for (let t in users) {
      if (users[t].socketId === socket.id) {
        console.log(`[DISCONNECT] ${t}`);
        delete users[t];
      }
    }
  });
});

// Servir call.html (interfaz de llamada) desde public
app.get('/call.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/call.html'));
});

// Render asigna el puerto automáticamente
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
