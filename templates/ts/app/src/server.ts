import { serve } from "@hono/node-server";
import { app } from "./app.ts";

// `||`, not `??`: an empty PORT falls back to the default instead of 0 (a random port).
const port = Number(process.env.PORT || 3000);

serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, (info) => {
  console.log(`__NAME__ listening on http://127.0.0.1:${info.port}`);
});
