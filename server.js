// server.js
const express = require('express');
const app = express();

// Puerto asignado por Render o 3000 por defecto
const PORT = process.env.PORT || 3000;

// Middleware para mostrar mensaje de mantenimiento
app.get('*', (req, res) => {
  res.status(503).send('<h1>Server in Maintenance</h1><p>We are currently updating the server. Please try again later.</p>');
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT} in maintenance mode`);
});
