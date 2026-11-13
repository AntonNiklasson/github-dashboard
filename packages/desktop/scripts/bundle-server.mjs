import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const serverEntry = resolve(here, "../../server/src/index.ts");
const outFile = resolve(here, "../dist/server.mjs");

await build({
  entryPoints: [serverEntry],
  outfile: outFile,
  bundle: true,
  platform: "node",
  // Bundle workspace source even on a clean checkout (before sync/dist exists).
  conditions: ["development"],
  target: "node20",
  format: "esm",
  banner: {
    // ESM bundles can lose `__dirname`-style helpers; provide shims for any
    // bundled deps that look them up.
    js: [
      "import { createRequire as __createRequire } from 'node:module';",
      "const require = __createRequire(import.meta.url);",
    ].join("\n"),
  },
  // Native addon is rebuilt/unpacked by electron-builder, not bundled.
  external: ["better-sqlite3"],
});

console.log(`Bundled server → ${outFile}`);
