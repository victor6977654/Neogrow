const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT; // Render exige esto

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

const DATA_PATH = path.join(__dirname, "proyectos.json");

function leerProyectos() {
    if (!fs.existsSync(DATA_PATH)) return [];
    return JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
}

function guardarProyectos(data) {
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

app.get("/api/proyectos", (req, res) => {
    res.json(leerProyectos());
});

app.post("/api/proyectos", (req, res) => {
    const { nombre, descripcion, html } = req.body;

    if (!nombre || !html) {
        return res.status(400).json({ error: "Faltan campos" });
    }

    const proyectos = leerProyectos();
    proyectos.push({ id: Date.now(), nombre, descripcion, html });

    guardarProyectos(proyectos);

    res.json({ ok: true });
});

app.get("/api/proyecto/:id", (req, res) => {
    const proyectos = leerProyectos();
    const proyecto = proyectos.find(p => p.id == req.params.id);

    if (!proyecto)
        return res.status(404).json({ error: "No encontrado" });

    res.json(proyecto);
});

app.listen(PORT, "0.0.0.0", () => {
    console.log("Seevidor lanzado en https://neogrow.onrender.com/");
});
