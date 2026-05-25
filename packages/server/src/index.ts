import { readFile } from "node:fs/promises";
import { join, normalize, resolve } from "node:path";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { loadCache } from "./cache.js";
import { getConfigStatus, getPort } from "./config.js";
import { api } from "./routes.js";
import { startSync } from "./sync.js";

loadCache();

const app = new Hono();

app.use("/api/*", cors());
app.route("/api", api);

// In packaged desktop builds, the server also serves the built web assets so
// the renderer can load everything from a single origin and relative `/api`
// fetches work without a base URL.
if (process.env.GHD_WEB_DIST) {
  const webDist = resolve(process.env.GHD_WEB_DIST);
  app.get("*", async (c) => {
    const reqPath = c.req.path === "/" ? "/index.html" : c.req.path;
    const filePath = normalize(join(webDist, reqPath));
    if (!filePath.startsWith(webDist)) return c.notFound();
    try {
      const content = await readFile(filePath);
      return new Response(new Uint8Array(content), {
        status: 200,
        headers: { "Content-Type": mimeFor(filePath) },
      });
    } catch {
      const html = await readFile(join(webDist, "index.html"));
      return new Response(html, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
  });
}

function mimeFor(path: string): string {
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (path.endsWith(".css")) return "text/css; charset=utf-8";
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".woff2")) return "font/woff2";
  if (path.endsWith(".woff")) return "font/woff";
  if (path.endsWith(".ico")) return "image/x-icon";
  if (path.endsWith(".json")) return "application/json";
  return "application/octet-stream";
}

const port = getPort();
console.log(`Server running on http://localhost:${port}`);
const server = serve({ fetch: app.fetch, port });

// Without these the process can outlive its parent shell (tsx watch + the
// sync interval keep the event loop alive). Close the server first so
// in-flight requests get a chance to finish — particularly mutations like
// merge/approve in the packaged desktop app — then exit. The 2s timeout
// fallback keeps Ctrl-C feeling instant if a request is wedged.
let shuttingDown = false;
const shutdown = () => {
  if (shuttingDown) return;
  shuttingDown = true;
  const force = setTimeout(() => process.exit(0), 2000);
  force.unref();
  server.close(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("SIGHUP", shutdown);

if (process.env.DEMO === "1") {
  console.log("DEMO mode: serving fixtures from .cache-demo, sync disabled");
  getConfigStatus();
} else {
  // Probe config + tokens, then start syncing regardless — sync skips
  // instances that didn't resolve.
  getConfigStatus().finally(() => startSync());
}
