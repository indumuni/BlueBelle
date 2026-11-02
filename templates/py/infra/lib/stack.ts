import { join } from "node:path";
import { HttpLambda, pythonWebCode } from "@bluebelle/infra-common";
import { Stack, type StackProps } from "aws-cdk-lib";
import type { Construct } from "constructs";

const appDir = join(import.meta.dirname, "../../../../apps/__NAME__");

export interface __PASCAL__StackProps extends StackProps {
  stage: string;
}

/** apps/__NAME__ (FastAPI) on Lambda (via Lambda Web Adapter) behind an HTTP API. */
export class __PASCAL__Stack extends Stack {
  constructor(scope: Construct, id: string, props: __PASCAL__StackProps) {
    super(scope, id, props);

    new HttpLambda(this, "Api", {
      language: "python",
      code: pythonWebCode(appDir, "__PKG__.main:app"),
      readinessPath: "/health",
    });
  }
}
