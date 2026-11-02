import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, test } from "vitest";
import {
  goWebCode,
  HttpLambda,
  LWA_LAYER_VERSION,
  nodeWebCode,
  pythonWebCode,
} from "../src/index.ts";
import { testStack } from "./helpers.ts";

const layer = Match.arrayWith([
  `arn:aws:lambda:us-east-1:753240598075:layer:LambdaAdapterLayerArm64:${LWA_LAYER_VERSION}`,
]);

describe("HttpLambda", () => {
  test("go: provided.al2023 bootstrap with web adapter, behind HTTP API", () => {
    const stack = testStack();
    new HttpLambda(stack, "Api", {
      language: "go",
      code: goWebCode(import.meta.dirname, "."),
      readinessPath: "/health",
    });
    const t = Template.fromStack(stack);
    t.hasResourceProperties("AWS::Lambda::Function", {
      Runtime: "provided.al2023",
      Handler: "bootstrap",
      Architectures: ["arm64"],
      Layers: layer,
      Environment: {
        Variables: { PORT: "8080", AWS_LWA_READINESS_CHECK_PATH: "/health" },
      },
    });
    t.resourceCountIs("AWS::ApiGatewayV2::Api", 1);
  });

  test("python: run.sh through the adapter exec wrapper", () => {
    const stack = testStack();
    new HttpLambda(stack, "Api", {
      language: "python",
      code: pythonWebCode(import.meta.dirname, "app:app"),
    });
    Template.fromStack(stack).hasResourceProperties("AWS::Lambda::Function", {
      Runtime: "python3.13",
      Handler: "run.sh",
      Layers: layer,
      Environment: {
        Variables: Match.objectLike({
          PORT: "8000",
          AWS_LAMBDA_EXEC_WRAPPER: "/opt/bootstrap",
        }),
      },
    });
  });

  test("node: run.sh (bundled server.mjs) through the adapter exec wrapper", () => {
    const stack = testStack();
    new HttpLambda(stack, "Api", {
      language: "node",
      code: nodeWebCode(import.meta.dirname),
    });
    Template.fromStack(stack).hasResourceProperties("AWS::Lambda::Function", {
      Runtime: "nodejs24.x",
      Handler: "run.sh",
      Architectures: ["arm64"],
      Layers: layer,
      Environment: {
        Variables: Match.objectLike({
          PORT: "3000",
          AWS_LAMBDA_EXEC_WRAPPER: "/opt/bootstrap",
        }),
      },
    });
  });
});
