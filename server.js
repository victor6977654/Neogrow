const http = require("http");

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/html" });

  res.end(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Under Construction</title>
        <style>
          body {
            margin: 0;
            height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            background: #111;
            color: #fff;
            font-family: Arial, sans-serif;
          }
          h1 {
            font-size: 3rem;
            color: orange;
          }
        </style>
      </head>
      <body>
        <h1>🚧 Under Construction 🚧</h1>
      </body>
    </html>
  `);
});

server.listen(PORT, () => {
  console.log(`Server corriendo en http://localhost:${PORT}`);
});
