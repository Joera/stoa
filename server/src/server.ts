import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels, createProvider } from "@earendil-works/pi-ai/models";
import type { Provider } from "@earendil-works/pi-ai/models";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { Harness, createRegistry } from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { loadConfig } from "./config.js";
import { RoomExtension } from "./room-extension.js";
import { handleClient } from "./bridge.js";
import { log, nextConnId } from "./log.js";
import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";

function veniceProvider(baseUrl: string): Provider<"openai-completions"> {
  return createProvider<"openai-completions">({
    id: "venice",
    name: "Venice",
    baseUrl,
    auth: {
      apiKey: {
        name: "Venice API key",
        async resolve({ credential }) {
          const key = credential?.key ?? process.env["VENICE_INFERENCE_KEY"];
          if (!key) return undefined;
          return { auth: { apiKey: key }, source: "VENICE_INFERENCE_KEY" };
        },
      },
    },
    api: { "openai-completions": openAICompletionsApi() },
    models: [
      {
        id: "deepseek-v4-flash-0731",
        name: "DeepSeek V4 Flash 0731 (Venice)",
        api: "openai-completions",
        provider: "venice",
        baseUrl: baseUrl,
        reasoning: true,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1048576,
        maxTokens: 1048576,
        type: "chat",
        thinkingLevelMap: {
          minimal: "low",
          low: "low",
          medium: "medium",
          high: "high",
          xhigh: "high",
          max: "high",
        },
        compat: {
          supportsStore: false,
          supportsDeveloperRole: false,
          maxTokensField: "max_tokens",
          thinkingFormat: "qwen-chat-template",
          chatTemplateKwargs: { enable_thinking: true, preserve_thinking: false },
          requiresReasoningContentOnAssistantMessages: true,
        },
      },
    ],
  });
}

async function main(): Promise<void> {
  const config = loadConfig();
  const ctx = BACKGROUND_CONTEXT;

  console.log(`Opening storage at ${config.storagePath}`);
  const storage = await openNodeSqliteStorage(config.storagePath);

  const models = createModels();
  models.setProvider(veniceProvider(config.veniceBaseUrl));

  const registry = createRegistry();
  registry.install(RoomExtension);

  console.log("Opening harness...");
  const harness = await Harness.open(
    storage,
    {
      models,
      registry,
      settings: {
        extensions: [RoomExtension],
        compaction: { reserveTokens: 16384, backgroundTokens: 0 },
      },
    },
    ctx
  );

  harness.resume();
  console.log("Harness ready, resumed pending work.");

  const httpServer = createServer((_req, res) => {
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
    const connId = nextConnId();
    log("ws", null, "client connected", connId);
    handleClient(harness, ws, ctx, connId);
    ws.on("close", () => log("ws", null, "client disconnected", connId));
  });

  httpServer.listen(config.port, () => {
    console.log(`Stoa server listening on port ${config.port} (WS at /ws)`);
    console.log(`Venice provider: ${config.veniceBaseUrl} / model: ${config.model}`);
    if (!config.veniceKey && !process.env["VENICE_INFERENCE_KEY"]) {
      console.log("⚠ No VENICE_INFERENCE_KEY set — model answers will not be available.");
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
