import { join } from "node:path";
import { StaticSite } from "@bluebelle/infra-common";
import { Stack, type StackProps } from "aws-cdk-lib";
import type { Construct } from "constructs";

export interface WebReactStackProps extends StackProps {
  stage: string;
  /** Built site; defaults to apps/web-react/dist (run `pnpm --filter web-react build`). */
  distDir?: string;
}

/** apps/web-react served from S3 through CloudFront. */
export class WebReactStack extends Stack {
  constructor(scope: Construct, id: string, props: WebReactStackProps) {
    super(scope, id, props);

    new StaticSite(this, "Site", {
      distDir:
        props.distDir ??
        join(import.meta.dirname, "../../../../apps/web-react/dist"),
    });
  }
}
