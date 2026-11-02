import { App, Stack } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { expect, test } from "vitest";
import { createProjectApp } from "../src/index.ts";

test("names stacks bb-<project>-<stage>[-<part>] and reads stage from context", () => {
  const { stage, stackName } = createProjectApp(
    "demo",
    new App({ context: { stage: "prod" } }),
  );
  expect(stage).toBe("prod");
  expect(stackName()).toBe("bb-demo-prod");
  expect(stackName("network")).toBe("bb-demo-prod-network");
});

test("defaults stage to dev and tags every resource", () => {
  const { app, stage } = createProjectApp("demo", new App());
  expect(stage).toBe("dev");
  const stack = new Stack(app, "S");
  new StringParameter(stack, "P", { stringValue: "x" });
  Template.fromStack(stack).hasResourceProperties("AWS::SSM::Parameter", {
    Tags: { Project: "BlueBelle", App: "demo", Stage: "dev" },
  });
});
