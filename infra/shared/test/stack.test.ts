import { createProjectApp } from "@bluebelle/infra-common";
import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { test } from "vitest";
import { SharedStack } from "../lib/stack.ts";

test("shared VPC is tagged for lookup and published to SSM", () => {
  const { app, stage, stackName } = createProjectApp("shared", new App());
  const t = Template.fromStack(
    new SharedStack(app, stackName("network"), { stage }),
  );
  t.hasResourceProperties("AWS::EC2::VPC", {
    Tags: Match.arrayWith([{ Key: "Shared", Value: "network" }]),
  });
  t.hasResourceProperties("AWS::SSM::Parameter", {
    Name: "/bluebelle/dev/shared/vpc-id",
  });
  t.resourceCountIs("AWS::EC2::NatGateway", 0);
});
