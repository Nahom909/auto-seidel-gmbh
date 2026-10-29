// Lokale Vorschau inklusive Chatbot: node dev-server.mjs  →  http://localhost:8803
// Liefert public/ aus und leitet POST /api/chat an die Netlify-Funktion weiter.
// Ohne ANTHROPIC_API_KEY antwortet der Chat mit den festen Antworten aus der Seite.
// POST / (Formular) wird lokal nur bestätigt; auf Netlify übernimmt das Netlify Forms.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import chat from "./netlify/functions/chat.mjs";

const ROOT = fileURLToPath(new URL("./public/", import.meta.url));
const PORT = Number(process.env.PORT) || 8803;
const TYPES = {
  ".html": "text/html; charset=utf-8", ".webp": "image/webp", ".css": "text/css", ".js": "text/javascript",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".json": "application/json",
  ".glb": "model/gltf-binary", ".wasm": "application/wasm",
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/api/chat") {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const response = await chat(new Request(url, { method: req.method, headers: req.headers, body: req.method === "POST" ? Buffer.concat(chunks) : undefined }));
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) Readable.fromWeb(response.body).pipe(res); else res.end();
    return;
  }
  if (req.method === "POST" && url.pathname === "/") {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    console.log("Formular (lokal):", Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString())));
    res.writeHead(200).end("ok");
    return;
  }
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "") || "index.html";
  const file = join(ROOT, rel.endsWith("/") || rel === "." ? join(rel, "index.html") : rel);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try {
    const data = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" }).end(data);
  } catch {
    res.writeHead(404).end("Nicht gefunden");
  }
}).listen(PORT, () => console.log(`Vorschau: http://localhost:${PORT}`));
