import { Hono } from "hono";

/** HTTP routes for __NAME__. Exported so tests can call app.request() directly. */
export const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok" }));
