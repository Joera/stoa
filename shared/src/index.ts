// @stoa/shared — public barrel.
// Re-exports everything from protocol.ts so consumers import by package name:
//   - server/  resolves the built package (@stoa/shared → dist/index.js/.d.ts)
//   - web/     esbuild aliases @stoa/shared → shared/src and bundles the raw TS
//              (directory alias resolves through this barrel — the s2s pattern)
export * from "./protocol.js";
