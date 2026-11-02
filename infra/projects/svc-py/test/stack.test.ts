import { createProjectApp } from "@bluebelle/infra-common";
import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { test } from "vitest";
import { SvcPyStack } from "../lib/stack.ts";

test("deploys the app as a Lambda behind an HTTP API", () => {
  const { app, stage, stackName } = createProjectApp(
    "svc-py",
    new App({ context: { "aws:cdk:bundling-stacks": [] } }),
  );
  const t = Template.fromStack(new SvcPyStack(app, stackName(), { stage }));
  t.hasResourceProperties("AWS::Lambda::Function", {
    Runtime: "python3.13",
    Environment: {
      Variables: Match.objectLike({ AWS_LWA_READINESS_CHECK_PATH: "/health" }),
    },
    Tags: Match.arrayWith([{ Key: "App", Value: "svc-py" }]),
  });
  t.resourceCountIs("AWS::ApiGatewayV2::Api", 1);
});
