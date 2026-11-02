import {
  SHARED_NETWORK_TAG,
  StandardVpc,
  sharedVpcIdParam,
} from "@bluebelle/infra-common";
import { Stack, type StackProps, Tags } from "aws-cdk-lib";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import type { Construct } from "constructs";

export interface SharedStackProps extends StackProps {
  stage: string;
}

/**
 * Resources deployed once per stage and used by many projects. Projects find
 * the VPC with lookupSharedVpc() or the SSM parameter; never by stack exports.
 */
export class SharedStack extends Stack {
  constructor(scope: Construct, id: string, props: SharedStackProps) {
    super(scope, id, props);

    const { vpc } = new StandardVpc(this, "Network");
    Tags.of(vpc).add(SHARED_NETWORK_TAG.key, SHARED_NETWORK_TAG.value);

    new StringParameter(this, "VpcIdParam", {
      parameterName: sharedVpcIdParam(props.stage),
      stringValue: vpc.vpcId,
    });
  }
}
