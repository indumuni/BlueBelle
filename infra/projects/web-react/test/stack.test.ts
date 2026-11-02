import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProjectApp } from "@bluebelle/infra-common";
import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { test } from "vitest";
import { WebReactStack } from "../lib/stack.ts";

test("serves the built site through CloudFront", () => {
  const distDir = mkdtempSync(join(tmpdir(), "web-react-dist-"));
  writeFileSync(join(distDir, "index.html"), "<h1>test</h1>");
  const { app, stage, stackName } = createProjectApp("web-react", new App());
  const t = Template.fromStack(
    new WebReactStack(app, stackName(), { stage, distDir }),
  );
  t.resourceCountIs("AWS::CloudFront::Distribution", 1);
  t.resourceCountIs("Custom::CDKBucketDeployment", 1);
  t.hasResourceProperties("AWS::S3::Bucket", {
    Tags: Match.arrayWith([{ Key: "App", Value: "web-react" }]),
  });
});
