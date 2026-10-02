import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
import { Harness, createRegistry } from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { loadConfig } from "./config.js";
import { RoomExtension } from "./room-extension.js";
import { handleClient } from "./bridge.js";
import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";

async function main(): Promise<void> {
  const config = loadConfig();
  const ctx = BACKGROUND_CONTEXT;

  console.log(`Opening storage at ${config.storagePath}`);
  const storage = await openNodeSqliteStorage(config.storagePath);

  const models = createModels();
  if (config.providerKey) {
    process.env["OPENAI_API_KEY"] = config.providerKey;
  }
  models.setProvider(openaiProvider());

  const registry = createRegistry();
  registry.install(RoomExtension);

  console.log("Opening harness...");
  const harness = await Harness.open(
    storage,
    { models, registry, settings: { extensions: [RoomExtension], compaction: { reserveTokens: 16384, backgroundTokens: 0 } } },
    ctx
  );

  harness.resume();
  console.log("Harness ready, resumed pending work.");

  const httpServer = createServer((_req, res) => {
    // No static serving — backend is WS-only. Return a simple health check for non-upgrade requests.
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Stoa server OK — WebSocket at /ws\n");
  });

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

  httpServer.listen(config.port, () => {
    console.log(`Stoa server listening on port ${config.port} (WS at /ws)`);
    if (!config.providerKey) {
      console.log("⚠ No PROVIDER_KEY set — model answers will not be available.");
    }
  });

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
