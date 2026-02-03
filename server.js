const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const PORT = process.env.PORT || 3000;

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// Servir todos los archivos de public_html
app.use(express.static(path.join(__dirname, 'public_html')));

// Redirigir rutas desconocidas a index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public_html', 'index.html'));
});

// --------------------
// Multiplayer básico: chat + votaciones
// --------------------
const rooms = {};

io.on('connection', (socket) => {
  console.log(`Usuario conectado: ${socket.id}`);

  socket.on('joinRoom', ({ room, username }) => {
    socket.join(room);
    if (!rooms[room]) rooms[room] = { users: [], chat: [] };
    rooms[room].users.push({ id: socket.id, name: username });
    io.to(room).emit('roomUpdate', rooms[room]);
  });

  // Mensajes de chat
  socket.on('chatMessage', ({ room, message, username }) => {
    if(!rooms[room]) return;
    rooms[room].chat.push({ username, message });
    io.to(room).emit('chatUpdate', { username, message });
  });

  // Votaciones
  socket.on('vote', ({ room, voter, target }) => {
    io.to(room).emit('voteUpdate', { voter, target });
  });

  socket.on('disconnect', () => {
    for (const room in rooms) {
      rooms[room].users = rooms[room].users.filter(u => u.id !== socket.id);
      io.to(room).emit('roomUpdate', rooms[room]);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor público corriendo en http://0.0.0.0:${PORT}`);
});
