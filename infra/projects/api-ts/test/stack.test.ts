import { createProjectApp } from "@bluebelle/infra-common";
import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { test } from "vitest";
import { ApiTsStack } from "../lib/stack.ts";

test("deploys the app as a Lambda behind an HTTP API", () => {
  const { app, stage, stackName } = createProjectApp(
    "api-ts",
    new App({ context: { "aws:cdk:bundling-stacks": [] } }),
  );
  const t = Template.fromStack(new ApiTsStack(app, stackName(), { stage }));
  t.hasResourceProperties("AWS::Lambda::Function", {
    Runtime: "nodejs24.x",
    Handler: "run.sh",
    Environment: {
      Variables: Match.objectLike({ AWS_LWA_READINESS_CHECK_PATH: "/health" }),
    },
    Tags: Match.arrayWith([{ Key: "App", Value: "api-ts" }]),
  });
  t.resourceCountIs("AWS::ApiGatewayV2::Api", 1);
});
