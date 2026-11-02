import { createProjectApp } from "@bluebelle/infra-common";
import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { test } from "vitest";
import { __PASCAL__Stack } from "../lib/stack.ts";

test("deploys the app as a Lambda behind an HTTP API", () => {
  const { app, stage, stackName } = createProjectApp(
    "__NAME__",
    new App({ context: { "aws:cdk:bundling-stacks": [] } }),
  );
  const t = Template.fromStack(
    new __PASCAL__Stack(app, stackName(), { stage }),
  );
  t.hasResourceProperties("AWS::Lambda::Function", {
    Runtime: "provided.al2023",
    Environment: {
      Variables: Match.objectLike({ AWS_LWA_READINESS_CHECK_PATH: "/health" }),
    },
    Tags: Match.arrayWith([{ Key: "App", Value: "__NAME__" }]),
  });
  t.resourceCountIs("AWS::ApiGatewayV2::Api", 1);
});
