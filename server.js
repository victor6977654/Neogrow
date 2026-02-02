const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

// URL base de tu hosting
const HOSTING_URL = "https://neogrow.unaux.com/almacen/node";

// Proxy dinámico
app.get("/*", async (req, res) => {
    try {
        // Construir URL completa en el hosting
        const targetUrl = `${HOSTING_URL}${req.path}`;
        
        // Hacer request al hosting
        const response = await axios.get(targetUrl, {
            responseType: "arraybuffer" // para manejar también CSS, JS, imágenes
        });

        // Devolver contenido tal cual al cliente
        // Usamos los headers del hosting para tipo de contenido
        res.set(response.headers);
        res.send(response.data);

    } catch (err) {
        res.status(500).send("Error al obtener archivo: " + err.message);
    }
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor proxy corriendo en http://0.0.0.0:${PORT}`);
});
