import { aws_ec2 as ec2 } from "aws-cdk-lib";
import { Construct } from "constructs";

export interface StandardVpcProps {
  /** Defaults to 2. */
  maxAzs?: number;
  /**
   * NAT gateways give private subnets internet egress but cost ~$32/month each.
   * Defaults to 0: private subnets are isolated and reach S3/DynamoDB through
   * free gateway endpoints.
   */
  natGateways?: number;
}

/** BlueBelle's default VPC layout: public + private subnets across AZs. */
export class StandardVpc extends Construct {
  readonly vpc: ec2.Vpc;

  constructor(scope: Construct, id: string, props: StandardVpcProps = {}) {
    super(scope, id);
    const natGateways = props.natGateways ?? 0;

    this.vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: props.maxAzs ?? 2,
      natGateways,
      subnetConfiguration: [
        { name: "public", subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        {
          name: "private",
          subnetType:
            natGateways > 0
              ? ec2.SubnetType.PRIVATE_WITH_EGRESS
              : ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
      gatewayEndpoints: {
        S3: { service: ec2.GatewayVpcEndpointAwsService.S3 },
        DynamoDB: { service: ec2.GatewayVpcEndpointAwsService.DYNAMODB },
      },
    });
  }
}
