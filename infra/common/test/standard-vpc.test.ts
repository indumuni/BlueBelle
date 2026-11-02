import { Template } from "aws-cdk-lib/assertions";
import { expect, test } from "vitest";
import { StandardVpc } from "../src/index.ts";
import { testStack } from "./helpers.ts";

test("defaults to no NAT gateways with isolated private subnets", () => {
  const stack = testStack();
  new StandardVpc(stack, "Net");
  const t = Template.fromStack(stack);
  t.resourceCountIs("AWS::EC2::NatGateway", 0);
  t.resourceCountIs("AWS::EC2::VPCEndpoint", 2);
  t.resourceCountIs("AWS::EC2::Subnet", 4);
});

test("creates NAT gateways when requested", () => {
  const stack = testStack();
  const { vpc } = new StandardVpc(stack, "Net", { natGateways: 1 });
  Template.fromStack(stack).resourceCountIs("AWS::EC2::NatGateway", 1);
  expect(vpc.privateSubnets).toHaveLength(2);
});
