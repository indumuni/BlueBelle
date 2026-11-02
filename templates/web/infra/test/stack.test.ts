import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProjectApp } from "@bluebelle/infra-common";
import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { test } from "vitest";
import { __PASCAL__Stack } from "../lib/stack.ts";

test("serves the built site through CloudFront", () => {
  const distDir = mkdtempSync(join(tmpdir(), "__NAME__-dist-"));
  writeFileSync(join(distDir, "index.html"), "<h1>test</h1>");
  const { app, stage, stackName } = createProjectApp("__NAME__", new App());
  const t = Template.fromStack(
    new __PASCAL__Stack(app, stackName(), { stage, distDir }),
  );
  t.resourceCountIs("AWS::CloudFront::Distribution", 1);
  t.resourceCountIs("Custom::CDKBucketDeployment", 1);
  t.hasResourceProperties("AWS::S3::Bucket", {
    Tags: Match.arrayWith([{ Key: "App", Value: "__NAME__" }]),
  });
});
