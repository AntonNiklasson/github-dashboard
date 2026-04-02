import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { loadCache } from "./cache.js";
import { getPort, resolveInstances } from "./config.js";
import { api } from "./routes.js";
import { startSync } from "./sync.js";

loadCache();

const app = new Hono();

app.use("/api/*", cors());
app.route("/api", api);

const port = getPort();
console.log(`Server running on http://localhost:${port}`);
serve({ fetch: app.fetch, port });

// Resolve usernames from tokens, then start syncing
resolveInstances()
	.then(() => startSync())
	.catch((err) => {
		console.error("Failed to resolve instances:", err instanceof Error ? err.message : err);
		startSync();
	});
