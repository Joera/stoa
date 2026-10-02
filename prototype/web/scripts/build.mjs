#!/usr/bin/env node
/**
 * esbuild bundle for the Stoa Lit web components SPA.
 * Entry: web/src/stoa-app.ts → output: web/dist/app.js (ESM).
 * /shared/protocol.js is marked external — the browser loads it at runtime.
 */
import * as esbuild from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const webDir = join(__dirname, "..");
const srcFile = join(webDir, "src", "stoa-app.ts");
const outFile = join(webDir, "dist", "app.js");

await esbuild.build({
  entryPoints: [srcFile],
  bundle: true,
  outfile: outFile,
  format: "esm",
  platform: "browser",
  target: ["es2022"],
  external: ["/shared/protocol.js"],
  minify: false,
  sourcemap: true,
});

console.log(`Built: ${outFile}`);
