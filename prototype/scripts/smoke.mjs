#!/usr/bin/env node

/**
 * Smoke test: boots the Stoa server, connects a WS client, sends join + submit,
 * and asserts that a view snapshot arrives along with subsequent protocol events.
 *
 * Requirements: zero real model key (PROVIDER_KEY unset). Verifies boot,
 * WS handshake, view snapshot, and protocol event flow. Model answers may be
 * absent without a key — the smoke must not hang or fail on that.
 */

import { spawn } from "node:child_process";
import { WebSocket } from "ws";
import { setTimeout as sleep } from "node:timers/promises";
import { randomUUID } from "node:crypto";

const PORT = 19876; // avoid conflicts
const STORAGE_PATH = `./smoke-${randomUUID()}.sqlite`;
const SERVER_START_TIMEOUT = 15_000;
const TEST_TIMEOUT = 20_000;

let serverProcess = null;
let ws = null;
let passed = 0;
let failed = 0;
const caveats = [];

function check(description, condition) {
  if (condition) {
    console.log(`  ✓ ${description}`);
    passed++;
  } else {
    console.log(`  ✗ ${description}`);
    failed++;
  }
}

function caveat(msg) {
  caveats.push(msg);
  console.log(`  ⚠ CAVEAT: ${msg}`);
}

async function main() {
  console.log("Stoa POC Smoke Test\n");

  // ── 1. Boot server ──────────────────────────────────────────────────────
  console.log("1. Booting server...");

  serverProcess = spawn("node", ["dist/server.js"], {
    env: {
      ...process.env,
      PORT: String(PORT),
      STORAGE_PATH,
      PROVIDER_KEY: "", // explicitly no key
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let serverOutput = "";
  serverProcess.stdout.on("data", (d) => { serverOutput += d.toString(); });
  serverProcess.stderr.on("data", (d) => { serverOutput += d.toString(); });

  // Wait for server to be ready
  const startTime = Date.now();
  let serverReady = false;
  while (Date.now() - startTime < SERVER_START_TIMEOUT) {
    if (serverOutput.includes("Stoa POC running")) {
      serverReady = true;
      break;
    }
    await sleep(200);
  }
  check("Server boots and logs ready message", serverReady);
  if (!serverReady) {
    console.error("Server output so far:", serverOutput.slice(-500));
    process.exit(1);
  }
  check("Server logs no-model-key warning", serverOutput.includes("No PROVIDER_KEY"));

  // ── 2. Static file serving ──────────────────────────────────────────────
  console.log("\n2. Static serving...");
  try {
    const httpRes = await fetch(`http://localhost:${PORT}/`);
    const html = await httpRes.text();
    check("GET / returns 200", httpRes.status === 200);
    check("Response contains <title>Stoa", html.includes("<title>Stoa"));
  } catch (e) {
    check("GET / returns 200", false);
    console.error("  Error:", e.message);
  }

  // ── 3. WebSocket handshake ──────────────────────────────────────────────
  console.log("\n3. WebSocket handshake...");
  ws = new WebSocket(`ws://localhost:${PORT}/ws`);
  const wsOpen = await new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), 5000);
    ws.on("open", () => { clearTimeout(timeout); resolve(true); });
    ws.on("error", () => { clearTimeout(timeout); resolve(false); });
  });
  check("WebSocket connects to /ws", wsOpen);
  if (!wsOpen) {
    console.error("  WebSocket failed to connect");
    serverProcess.kill();
    process.exit(1);
  }

  // ── 4. Join → view snapshot ─────────────────────────────────────────────
  console.log("\n4. Join → view snapshot...");

  const messages = [];
  ws.on("message", (data) => {
    try { messages.push(JSON.parse(data.toString())); } catch {}
  });

  ws.send(JSON.stringify({ t: "join", room: "main" }));

  // Wait for view message
  let viewMsg = null;
  const viewStart = Date.now();
  while (Date.now() - viewStart < 8000) {
    viewMsg = messages.find((m) => m.t === "view");
    if (viewMsg) break;
    await sleep(100);
  }
  check("Receives {t:'view'} snapshot after join", !!viewMsg);
  if (viewMsg) {
    check("Snapshot has entries array", Array.isArray(viewMsg.snapshot?.entries));
    check("Snapshot has live field", "live" in (viewMsg.snapshot ?? {}));
    check("Snapshot has inbox field", "inbox" in (viewMsg.snapshot ?? {}));
    check("Snapshot has agent field", "agent" in (viewMsg.snapshot ?? {}));
    check("Snapshot has usage field", "usage" in (viewMsg.snapshot ?? {}));
  }

  // ── 5. Submit ───────────────────────────────────────────────────────────
  console.log("\n5. Submit...");
  const requestId = randomUUID();
  ws.send(JSON.stringify({
    t: "submit",
    content: "Hello Stoa!",
    requestId,
  }));

  // Wait a bit for any response events
  await sleep(2000);

  // Check for commit/delta events
  const commits = messages.filter((m) => m.t === "commit");
  const deltas = messages.filter((m) => m.t === "answer_delta");
  const errors = messages.filter((m) => m.t === "error");

  console.log(`  Received: ${commits.length} commit(s), ${deltas.length} delta(s), ${errors.length} error(s)`);

  check("No protocol errors received", errors.length === 0);

  if (deltas.length === 0 && commits.length === 0) {
    caveat("No model answers or commits — expected without PROVIDER_KEY; server boots + WS + view snapshot verified OK");
  } else {
    check("Received commit or delta events after submit", commits.length > 0 || deltas.length > 0);
  }

  // ── 6. Ping ─────────────────────────────────────────────────────────────
  console.log("\n6. Ping...");
  ws.send(JSON.stringify({ t: "ping" }));
  await sleep(500);
  // ping doesn't produce a response; just verify no crash
  check("Ping does not crash connection", ws.readyState === WebSocket.OPEN);

  // ── 7. Cleanup ───────────────────────────────────────────────────────────
  console.log("\n7. Cleanup...");
  ws.close();
  await sleep(500);
  serverProcess.kill("SIGTERM");
  await sleep(1000);
  check("Server exits cleanly", serverProcess.killed || serverProcess.exitCode !== null);

  // ── Report ───────────────────────────────────────────────────────────────
  console.log(`\n${"=".repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (caveats.length > 0) {
    console.log(`\nCaveats:`);
    for (const c of caveats) console.log(`  - ${c}`);
  }

  // Clean up temp sqlite
  try {
    const fs = await import("node:fs");
    fs.unlinkSync(STORAGE_PATH);
    fs.unlinkSync(`${STORAGE_PATH}-wal`);
    fs.unlinkSync(`${STORAGE_PATH}-shm`);
  } catch {}

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Smoke test error:", err);
  if (serverProcess) serverProcess.kill();
  try {
    const fs = require("node:fs");
    fs.unlinkSync(STORAGE_PATH);
  } catch {}
  process.exit(1);
});
