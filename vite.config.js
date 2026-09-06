import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

/** Load .env into process.env for the dev API middleware (Vercel does this in
 *  production). Real env vars always win over the file. */
function loadDotEnv() {
  try {
    for (const line of readFileSync(".env", "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq === -1) continue;
      const k = t.slice(0, eq).trim();
      const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!(k in process.env) && v) process.env[k] = v;
    }
  } catch {
    /* no .env — the route will return its own 503 */
  }
}

/**
 * Serve `api/*.ts` during `npm run dev`.
 *
 * Vercel deploys everything under `api/` as a serverless function, but the Vite
 * dev server knows nothing about that — so `POST /api/agent` returned 404
 * locally and the agent console appeared broken even though the code was fine.
 * Previously the only way to run the API locally was `vercel dev`.
 *
 * This mounts the same handler module as middleware, so `npm run dev` exercises
 * the real route: same validation, same rate limiting, same SSE streaming.
 *
 * Dev only — `apply: "serve"` keeps it out of the production build, where
 * Vercel does this itself.
 */
function apiDevServer() {
  return {
    name: "api-dev-server",
    apply: "serve",
    configureServer(server) {
      loadDotEnv();
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/")) return next();

        const route = req.url.split("?")[0].replace(/^\/api\//, "").replace(/\/$/, "");
        const modulePath = `/api/${route}.ts`;

        try {
          // ssrLoadModule gives HMR: editing api/agent.ts is picked up without
          // restarting the dev server.
          const mod = await server.ssrLoadModule(modulePath);
          const handler = mod.default;
          if (typeof handler !== "function") {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: `${modulePath} has no default export.` }));
            return;
          }
          await handler(req, res);
        } catch (err) {
          // A missing module is a genuine 404; anything else is a real error and
          // should say so loudly in the terminal rather than silently 404ing.
          const message = err instanceof Error ? err.message : String(err);
          if (/Failed to load url|Cannot find module|ENOENT/i.test(message)) {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: `No API route at /api/${route}` }));
            return;
          }
          server.config.logger.error(`[api-dev-server] ${modulePath} failed:\n${message}`);
          if (!res.writableEnded) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: "API route threw. See the dev server terminal." }));
          }
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), apiDevServer()],
});
