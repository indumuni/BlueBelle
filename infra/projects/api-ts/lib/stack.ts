import { join } from "node:path";
import { HttpLambda, nodeWebCode } from "@bluebelle/infra-common";
import { Stack, type StackProps } from "aws-cdk-lib";
import type { Construct } from "constructs";

const appDir = join(import.meta.dirname, "../../../../apps/api-ts");

export interface ApiTsStackProps extends StackProps {
  stage: string;
}

/** apps/api-ts (Hono) on Lambda (via Lambda Web Adapter) behind an HTTP API. */
export class ApiTsStack extends Stack {
  constructor(scope: Construct, id: string, props: ApiTsStackProps) {
    super(scope, id, props);

    new HttpLambda(this, "Api", {
      language: "node",
      code: nodeWebCode(appDir),
      readinessPath: "/health",
    });
  }
}
