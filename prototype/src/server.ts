import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
import { Harness, createRegistry } from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { loadConfig } from "./config.js";
import { RoomExtension } from "./room-extension.js";
import { handleClient } from "./bridge.js";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC_DIR = join(__dirname, "..", "public");

function serveStatic(req: IncomingMessage, res: ServerResponse): boolean {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  let pathname = url.pathname;
  if (pathname === "/" || pathname === "") pathname = "/index.html";

  const filePath = join(PUBLIC_DIR, pathname);
  if (!existsSync(filePath)) return false;

  const ext = extname(filePath).toLowerCase();
  const mime = MIME_TYPES[ext] ?? "application/octet-stream";

  try {
    const content = readFileSync(filePath);
    res.writeHead(200, { "Content-Type": mime });
    res.end(content);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const ctx = BACKGROUND_CONTEXT;

  // ── Storage ────────────────────────────────────────────────────────────
  console.log(`Opening storage at ${config.storagePath}`);
  const storage = await openNodeSqliteStorage(config.storagePath);

  // ── Models ─────────────────────────────────────────────────────────────
  const models = createModels();
  if (config.providerKey) {
    process.env["OPENAI_API_KEY"] = config.providerKey;
  }
  models.setProvider(openaiProvider());

  // ── Registry + Extension ───────────────────────────────────────────────
  const registry = createRegistry();
  registry.install(RoomExtension);

  // ── Harness ────────────────────────────────────────────────────────────
  console.log("Opening harness...");
  const harness = await Harness.open(
    storage,
    {
      models,
      registry,
      settings: {
        extensions: [RoomExtension],
        compaction: {
          reserveTokens: 16384,
          backgroundTokens: 0,
        },
      },
    },
    ctx
  );

  harness.resume();
  console.log("Harness ready, resumed pending work.");

  // ── HTTP server ──────────────────────────────────────────────────────────
  const httpServer = createServer((req, res) => {
    if (!serveStatic(req, res)) {
      res.writeHead(404);
      res.end("Not found");
    }
  });

  // ── WebSocket server ────────────────────────────────────────────────────
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    if (url.pathname === "/ws") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on("connection", (ws: WebSocket) => {
    console.log("WS client connected");
    handleClient(harness, ws, ctx);
    ws.on("close", () => console.log("WS client disconnected"));
  });

  // ── Listen ────���────────────────────────────────────────────────────────
  httpServer.listen(config.port, () => {
    console.log(`Stoa POC running on http://localhost:${config.port}`);
    console.log(`WebSocket at ws://localhost:${config.port}/ws`);
    if (!config.providerKey) {
      console.log("⚠ No PROVIDER_KEY set — model answers will not be available.");
    }
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log("\nShutting down...");
    wss.close();
    httpServer.close();
    await harness.close(ctx);
    await storage.close(ctx);
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
