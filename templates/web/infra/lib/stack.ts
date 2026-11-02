import { join } from "node:path";
import { StaticSite } from "@bluebelle/infra-common";
import { Stack, type StackProps } from "aws-cdk-lib";
import type { Construct } from "constructs";

export interface __PASCAL__StackProps extends StackProps {
  stage: string;
  /** Built site; defaults to apps/__NAME__/dist (run `pnpm --filter __NAME__ build`). */
  distDir?: string;
}

/** apps/__NAME__ served from S3 through CloudFront. */
export class __PASCAL__Stack extends Stack {
  constructor(scope: Construct, id: string, props: __PASCAL__StackProps) {
    super(scope, id, props);

    new StaticSite(this, "Site", {
      distDir:
        props.distDir ??
        join(import.meta.dirname, "../../../../apps/__NAME__/dist"),
    });
  }
}
