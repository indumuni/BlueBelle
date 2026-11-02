import { spawnSync } from "node:child_process";
import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  AssetHashType,
  aws_apigatewayv2 as apigw,
  CfnOutput,
  DockerImage,
  Duration,
  aws_apigatewayv2_integrations as integrations,
  aws_lambda as lambda,
  aws_logs as logs,
  Stack,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import { buildSync } from "esbuild";

/**
 * AWS Lambda Web Adapter layer version (arm64). Lets an unmodified HTTP server
 * run on Lambda. Releases: https://github.com/awslabs/aws-lambda-web-adapter
 */
export const LWA_LAYER_VERSION = 30;
const LWA_ACCOUNT = "753240598075";

export type WebLanguage = "go" | "python" | "node";

const RUNTIMES: Record<
  WebLanguage,
  { runtime: lambda.Runtime; handler: string; port: number }
> = {
  go: {
    runtime: lambda.Runtime.PROVIDED_AL2023,
    handler: "bootstrap",
    port: 8080,
  },
  python: {
    runtime: lambda.Runtime.PYTHON_3_13,
    handler: "run.sh",
    port: 8000,
  },
  node: { runtime: lambda.Runtime.NODEJS_24_X, handler: "run.sh", port: 3000 },
};

export interface HttpLambdaProps {
  language: WebLanguage;
  /** Build with goWebCode(), pythonWebCode() or nodeWebCode(). */
  code: lambda.Code;
  /** Port the server listens on inside Lambda. Defaults: go 8080, python 8000, node 3000. */
  port?: number;
  /** Path the adapter polls until the app is ready. Defaults to "/". */
  readinessPath?: string;
  memorySize?: number;
  timeout?: Duration;
  environment?: Record<string, string>;
}

/** An HTTP server (Go, Python or Node) on Lambda (arm64) behind an HTTP API. */
export class HttpLambda extends Construct {
  readonly fn: lambda.Function;
  readonly api: apigw.HttpApi;

  constructor(scope: Construct, id: string, props: HttpLambdaProps) {
    super(scope, id);
    const isGo = props.language === "go";
    const { runtime, handler, port: defaultPort } = RUNTIMES[props.language];
    const port = props.port ?? defaultPort;
    const region = Stack.of(this).region;

    this.fn = new lambda.Function(this, "Function", {
      runtime,
      architecture: lambda.Architecture.ARM_64,
      handler,
      code: props.code,
      memorySize: props.memorySize ?? 256,
      timeout: props.timeout ?? Duration.seconds(10),
      layers: [
        lambda.LayerVersion.fromLayerVersionArn(
          this,
          "WebAdapter",
          `arn:aws:lambda:${region}:${LWA_ACCOUNT}:layer:LambdaAdapterLayerArm64:${LWA_LAYER_VERSION}`,
        ),
      ],
      environment: {
        PORT: String(port),
        AWS_LWA_READINESS_CHECK_PATH: props.readinessPath ?? "/",
        // Python and Node run run.sh through the adapter's wrapper; Go's bootstrap is the server itself.
        ...(isGo ? {} : { AWS_LAMBDA_EXEC_WRAPPER: "/opt/bootstrap" }),
        ...props.environment,
      },
      logGroup: new logs.LogGroup(this, "Logs", {
        retention: logs.RetentionDays.TWO_WEEKS,
      }),
    });

    this.api = new apigw.HttpApi(this, "Api", {
      defaultIntegration: new integrations.HttpLambdaIntegration(
        "Integration",
        this.fn,
      ),
    });

    new CfnOutput(this, "Url", { value: this.api.apiEndpoint });
  }
}

function run(
  cmd: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = {},
): void {
  const res = spawnSync(cmd, args, {
    cwd,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  if (res.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed in ${cwd}`);
  }
}

// Local bundling only (uses the mise-pinned toolchain); no Docker needed.
const noDocker = DockerImage.fromRegistry(
  "public.ecr.aws/docker/library/busybox",
);

// Hash the bundled output, not the source folder: bundles also pull in code from
// outside it (go.work, uv.lock, pnpm-lock.yaml, packages/), and a source hash
// would let a dependency-only change deploy a stale cached asset.
const outputHash = { assetHashType: AssetHashType.OUTPUT } as const;

/** Builds a Go main package as a linux/arm64 `bootstrap` binary. */
export function goWebCode(moduleDir: string, mainPkg: string): lambda.Code {
  return lambda.Code.fromAsset(moduleDir, {
    exclude: ["bin", "*_test.go"],
    ...outputHash,
    bundling: {
      image: noDocker,
      local: {
        tryBundle(outputDir) {
          run(
            "go",
            [
              "build",
              "-trimpath",
              "-ldflags=-s -w",
              "-o",
              join(outputDir, "bootstrap"),
              mainPkg,
            ],
            moduleDir,
            { GOOS: "linux", GOARCH: "arm64", CGO_ENABLED: "0" },
          );
          return true;
        },
      },
    },
  });
}

/**
 * Installs a Python project and its deps for Lambda (manylinux arm64) and adds
 * a run.sh that starts uvicorn with the given ASGI app (e.g. "svc_py.main:app").
 */
export function pythonWebCode(
  projectDir: string,
  asgiApp: string,
): lambda.Code {
  return lambda.Code.fromAsset(projectDir, {
    exclude: [".venv", "__pycache__", "tests", ".pytest_cache"],
    ...outputHash,
    bundling: {
      image: noDocker,
      local: {
        tryBundle(outputDir) {
          run(
            "uv",
            [
              "pip",
              "install",
              "--quiet",
              "--target",
              outputDir,
              "--python-platform",
              "aarch64-manylinux2014",
              "--python-version",
              "3.13",
              ".",
            ],
            projectDir,
          );
          const script = join(outputDir, "run.sh");
          writeFileSync(
            script,
            `#!/bin/bash\nexec python -m uvicorn --host 127.0.0.1 --port "\${PORT:-8000}" ${asgiApp}\n`,
          );
          chmodSync(script, 0o755);
          return true;
        },
      },
    },
  });
}

/**
 * Bundles a Node HTTP server (e.g. Hono on @hono/node-server) into a single
 * server.mjs with esbuild and adds a run.sh that starts it.
 */
export function nodeWebCode(
  appDir: string,
  entry = "src/server.ts",
): lambda.Code {
  return lambda.Code.fromAsset(appDir, {
    exclude: ["node_modules", "dist", "*.test.ts"],
    ...outputHash,
    bundling: {
      image: noDocker,
      local: {
        tryBundle(outputDir) {
          // esbuild's JS API: the app folder has no esbuild binary of its own.
          buildSync({
            entryPoints: [join(appDir, entry)],
            bundle: true,
            platform: "node",
            format: "esm",
            target: "node24",
            outfile: join(outputDir, "server.mjs"),
            banner: {
              // Gives bundled CommonJS deps a `require` without declaring any
              // top-level name that a bundled module could also declare.
              js: 'import{createRequire as __bbCreateRequire}from"node:module";globalThis.require??=__bbCreateRequire(import.meta.url);',
            },
            logLevel: "warning",
          });
          const script = join(outputDir, "run.sh");
          writeFileSync(script, "#!/bin/bash\nexec node server.mjs\n");
          chmodSync(script, 0o755);
          return true;
        },
      },
    },
  });
}
