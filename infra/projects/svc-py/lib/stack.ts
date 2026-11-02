import { join } from "node:path";
import { HttpLambda, pythonWebCode } from "@bluebelle/infra-common";
import { Stack, type StackProps } from "aws-cdk-lib";
import type { Construct } from "constructs";

const appDir = join(import.meta.dirname, "../../../../apps/svc-py");

export interface SvcPyStackProps extends StackProps {
  stage: string;
}

/** apps/svc-py (FastAPI) on Lambda (via Lambda Web Adapter) behind an HTTP API. */
export class SvcPyStack extends Stack {
  constructor(scope: Construct, id: string, props: SvcPyStackProps) {
    super(scope, id, props);

    new HttpLambda(this, "Api", {
      language: "python",
      code: pythonWebCode(appDir, "svc_py.main:app"),
      readinessPath: "/health",
    });
  }
}
