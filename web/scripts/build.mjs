#!/usr/bin/env node
/**
 * esbuild bundle for the Stoa Lit web components SPA.
 * Entry: web/src/stoa-app.ts → output: web/dist/app.js (ESM).
 *
 * @stoa/shared is imported BY NAME and bundled from raw TypeScript source via
 * esbuild's alias option (mapped to shared/src) — the s2s browser pattern.
 * Nothing is external and nothing is served over HTTP at runtime (the old
 * runtime-URL shared-module external is gone).
 */
import * as esbuild from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const webDir = join(__dirname, "..");
const srcFile = join(webDir, "src", "stoa-app.ts");
const outFile = join(webDir, "dist", "app.js");
// Map the @stoa/shared package name straight to its raw TS source (shared/src)
// so the browser bundle inlines the protocol module instead of loading it over HTTP.
const sharedSrcDir = resolve(webDir, "..", "shared", "src");

await esbuild.build({
  entryPoints: [srcFile],
  bundle: true,
  outfile: outFile,
  format: "esm",
  platform: "browser",
  target: ["es2022"],
  alias: {
    "@stoa/shared": sharedSrcDir,
  },
  minify: false,
  sourcemap: true,
});

console.log(`Built: ${outFile}`);
