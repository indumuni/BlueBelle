import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { App, Stack } from "aws-cdk-lib";

/** App that skips asset bundling, so tests don't run go/uv builds. */
export function testStack(): Stack {
  const app = new App({ context: { "aws:cdk:bundling-stacks": [] } });
  return new Stack(app, "Test", {
    env: { account: "123456789012", region: "us-east-1" },
  });
}

export function tempDistDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "bb-dist-"));
  writeFileSync(join(dir, "index.html"), "<h1>test</h1>");
  return dir;
}
