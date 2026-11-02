// tools/servidor.mjs — servidor estático mínimo para jugar en local.
// Solo para desarrollo: en producción no hay servidor (GitHub Pages u otro
// estático sirve los archivos tal cual). Sin dependencias.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const PUERTO = Number(process.env.PORT) || 8000;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const servidor = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let ruta = normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/, "");
    if (ruta === "" || ruta === ".") ruta = "index.html";
    const destino = join(RAIZ, ruta);
    // Sin salir de la raíz del proyecto (path traversal).
    if (!destino.startsWith(RAIZ)) {
      res.writeHead(403).end("403");
      return;
    }
    const cuerpo = await readFile(destino);
    res.writeHead(200, { "Content-Type": MIME[extname(destino)] ?? "application/octet-stream" });
    res.end(cuerpo);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("404");
  }
});

// Error amigable si el puerto ya está ocupado (en vez de traza de Node).
servidor.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`El puerto ${PUERTO} ya esta en uso por otro programa.`);
    console.error("Cierra ese servidor (Ctrl+C en su terminal) o arranca este en otro puerto:");
    console.error("  PORT=8080 npm start");
    process.exit(1);
  }
  throw err;
});

servidor.listen(PUERTO, () => {
  console.log(`2048 escuchando en http://localhost:${PUERTO}`);
});
