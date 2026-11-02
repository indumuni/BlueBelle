import { join } from "node:path";
import { goWebCode, HttpLambda } from "@bluebelle/infra-common";
import { Stack, type StackProps } from "aws-cdk-lib";
import type { Construct } from "constructs";

const appDir = join(import.meta.dirname, "../../../../apps/api-go");

export interface ApiGoStackProps extends StackProps {
  stage: string;
}

/** apps/api-go on Lambda (via Lambda Web Adapter) behind an HTTP API. */
export class ApiGoStack extends Stack {
  constructor(scope: Construct, id: string, props: ApiGoStackProps) {
    super(scope, id, props);

    new HttpLambda(this, "Api", {
      language: "go",
      code: goWebCode(appDir, "./cmd/api-go"),
      readinessPath: "/health",
    });
  }
}
