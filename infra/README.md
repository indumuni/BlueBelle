# Infrastructure

AWS infrastructure for BlueBelle, written in **AWS CDK (TypeScript)**. Each project has
its **own CDK app**, so you can create, update and destroy one project's infrastructure
without touching the others.

```
infra/
├── common/              @bluebelle/infra-common: reusable constructs (never deployed itself)
├── shared/              resources deployed once per stage (VPC)  → bb-shared-<stage>-network
├── projects/
│   ├── api-go/          apps/api-go on Lambda + HTTP API         → bb-api-go-<stage>
│   ├── api-ts/          apps/api-ts on Lambda + HTTP API         → bb-api-ts-<stage>
│   ├── svc-py/          apps/svc-py on Lambda + HTTP API         → bb-svc-py-<stage>
│   └── web-react/       apps/web-react on S3 + CloudFront        → bb-web-react-<stage>
└── scripts/new-project.mjs   empty project scaffold (just new-infra)
```

## Everyday commands

`<target>` is `shared` or a folder name under `projects/`. `stage` defaults to `dev`.

```sh
just cdk-bootstrap                  # once per AWS account/region
just infra-list                     # shared, api-go, api-ts, svc-py, web-react
just infra-synth  web-react         # build templates → infra/projects/web-react/cdk.out
just infra-diff   web-react
just infra-deploy web-react         # create or update
just infra-destroy web-react        # delete just this project's stacks
just infra-deploy api-go prod       # another stage → bb-api-go-prod
just new-infra my-idea              # scaffold infra/projects/my-idea
```

They use your `default` AWS profile unless you set `AWS_PROFILE=<name>`. If a project
defines a `prepare-app` script in its `package.json`, it runs first; `web-react` uses
this to build the site.

## Common templates (`infra/common`)

| Export | What it creates |
|---|---|
| `createProjectApp(name)` | CDK `App` with stage from context, AWS env, standard tags (`Project`, `App`, `Stage`), `stackName()` helper |
| `StandardVpc` | 2-AZ VPC with public and private subnets, plus free S3/DynamoDB gateway endpoints. `natGateways` defaults to **0** (free); each NAT costs about $32/month |
| `lookupSharedVpc(scope, stage)` | Finds the VPC deployed by `infra/shared`. Needs AWS credentials at synth |
| `StaticSite` | Private S3 bucket, CloudFront with origin access control, upload of a `dist` directory, SPA fallback |
| `HttpLambda` + `goWebCode()` / `pythonWebCode()` / `nodeWebCode()` | An **unmodified** Go, Python or Node HTTP server on Lambda (arm64) using the [Lambda Web Adapter](https://github.com/awslabs/aws-lambda-web-adapter) layer, behind an HTTP API. `language: "go" \| "python" \| "node"` (default ports 8080, 8000, 3000). Bundled locally with the mise toolchain (Node: esbuild into a single `server.mjs`), so no Docker is needed |

Add a new reusable pattern to `common/src`, export it from `index.ts`, and write a test in
`common/test`.

## Adding infra for a project

`just new-go|new-py|new-web|new-ts <name>` already creates `infra/projects/<app>` next to
the app, from `templates/<kind>/infra`. Run `just infra-diff <app>`, then
`just infra-deploy <app>`.

For a stack that doesn't belong to an app:

1. `just new-infra <name>` (empty stack).
2. Build the stack in `infra/projects/<name>/lib/stack.ts` from the common constructs.
3. Add assertions in `test/stack.test.ts` and run `just test`.
4. Run `just infra-diff <name>`, then `just infra-deploy <name>`.

To remove it, run `just infra-destroy <name>` and then delete the folder.

## Shared resources

`infra/shared` holds things that are expensive or should exist only once. It currently
contains a per-stage VPC, which is free with 0 NAT gateways. To use it from a project:

```ts
const vpc = lookupSharedVpc(this, props.stage);
```

Deploy `shared` before any project that looks it up, and destroy those projects before
destroying `shared`. Projects never reference each other's stacks.

## Notes

- **Bootstrap:** `just cdk-bootstrap` creates the CDKToolkit stack (an S3 bucket, an ECR repo and IAM roles; a few cents a month).
- **Context cache:** CDK caches lookups in `cdk.context.json`. It's gitignored because it contains your AWS account ID and this repo is public.
- **Lambda Web Adapter layer version:** pinned as `LWA_LAYER_VERSION` in `common/src/http-lambda.ts`.
- **CI** builds, tests and synthesizes every target without AWS credentials. Deploys happen only from your machine.
