import { describe, expect, test } from "vitest";
import { app } from "./app.ts";

describe("routes", () => {
  test("GET /health returns ok", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  test.each([
    ["POST", "/health"],
    ["GET", "/nope"],
  ])("%s %s is not found", async (method, path) => {
    const res = await app.request(path, { method });
    expect(res.status).toBe(404);
  });
});
