import { aws_ec2 as ec2 } from "aws-cdk-lib";
import type { Construct } from "constructs";

/** Tag that marks the VPC deployed by infra/shared. */
export const SHARED_NETWORK_TAG = { key: "Shared", value: "network" } as const;

/** SSM parameter holding the shared VPC id for a stage. */
export const sharedVpcIdParam = (stage: string) =>
  `/bluebelle/${stage}/shared/vpc-id`;

/**
 * Looks up the VPC deployed by `infra/shared` for this stage. Requires AWS
 * credentials at synth time; the result is cached in the project's
 * cdk.context.json (gitignored: it contains the account id). Deploy `shared` first.
 */
export function lookupSharedVpc(scope: Construct, stage: string): ec2.IVpc {
  return ec2.Vpc.fromLookup(scope, "SharedVpc", {
    tags: {
      Project: "BlueBelle",
      Stage: stage,
      [SHARED_NETWORK_TAG.key]: SHARED_NETWORK_TAG.value,
    },
  });
}
