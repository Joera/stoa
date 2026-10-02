#!/usr/bin/env node

/**
 * Tiny static server for the web SPA.
 * Serves web/ (index.html, config.js) AND maps /shared/* → ../shared/*.
 * Usage: node prototype/web/scripts/serve.mjs [port]
 */

import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = parseInt(process.argv[2] ?? "8081", 10);
const WEB_DIR = fileURLToPath(new URL("..", import.meta.url)); // web/
const SHARED_DIR = join(WEB_DIR, "..", "shared");               // prototype/shared/

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function serveFile(res, filePath) {
  const ext = extname(filePath).toLowerCase();
  const mime = MIME[ext] ?? "application/octet-stream";
  try {
    const content = readFileSync(filePath);
    res.writeHead(200, { "Content-Type": mime });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  let pathname = url.pathname;
  if (pathname === "/" || pathname === "") pathname = "/index.html";

  if (pathname.startsWith("/shared/") && !pathname.includes("..")) {
    // Map /shared/* → prototype/shared/*
    const rel = pathname.slice("/shared/".length);
    const filePath = join(SHARED_DIR, rel);
    if (existsSync(filePath) && statSync(filePath).isFile()) {
      serveFile(res, filePath);
      return;
    }
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  // Serve from web/ directory
  const filePath = join(WEB_DIR, pathname.slice(1));
  if (existsSync(filePath) && statSync(filePath).isFile()) {
    serveFile(res, filePath);
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`Stoa web server on http://localhost:${PORT}`);
  console.log(`  Web root:  ${WEB_DIR}`);
  console.log(`  /shared/ → ${SHARED_DIR}`);
});
