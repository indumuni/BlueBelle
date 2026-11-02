# Implementation Plan: App Templates

**Branch**: `002-app-templates` | **Date**: 2026-11-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-app-templates/spec.md`

## Summary

This feature replaces the three inconsistent `just new-*` recipes with a single Node generator, `scripts/new-app.mjs`. The generator copies a per-kind **app template** and a per-kind **infra template** from a new top-level `templates/` folder. It substitutes name placeholders, refuses to run (writing nothing) if either target folder exists, and registers the app with its workspace.

The feature also:
- Adds a fourth kind, a **TypeScript backend on Hono**.
- Teaches `HttpLambda` in `infra/common` to run Node servers.
- Regenerates the sample apps from the templates.
- Adds a CI job that scaffolds every kind and runs lint, test, build and synth.

See [research.md](./research.md) for the reasoning behind each decision.

## Technical Context

**Language/Version**: Go 1.27.3, Python 3.13, Node 24 with TypeScript 7 (strict), all pinned in `.mise.toml`.

**Primary Dependencies**:
- Existing: FastAPI and uvicorn (Python template); React 19 with Vite 8 (web template); aws-cdk-lib 2.275.0 (infra).
- **New**: `hono` and `@hono/node-server` (TS template); `esbuild` (explicit dependency of `infra/common`, for bundling Node Lambdas).

**Storage**: None.

**Testing**:
- Go: `go test`, table-driven.
- Python: pytest with FastAPI `TestClient`.
- React: Vitest with Testing Library.
- TS backend: Vitest calling `app.request()`.
- Infra: Vitest with CDK `Template` assertions.
- CI scaffold smoke test (`just test-templates`).

**Target Platform**: Developer machines (macOS or Linux) and GitHub Actions. Apps run on AWS Lambda (arm64) behind an HTTP API, or on S3 with CloudFront.

**Project Type**: Monorepo tooling (scaffolding plus templates) and one shared infra construct change.

**Performance Goals**: A scaffold finishes in under 1 minute after first-time dependency downloads (SC-001).

**Constraints**:
- A refused scaffold writes nothing (FR-008).
- Templates are invisible to workspaces and linters (FR-002).
- Bundling uses no Docker (matches existing `goWebCode` and `pythonWebCode`).
- No AWS credentials in CI.

**Scale/Scope**: 4 kinds, 8 template folders, 1 generator, 4 regenerated samples.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / Rule | Status | Notes |
|---|---|---|
| I. Spec Before Substance | ✅ | This spec (`002`), built on `001`. |
| II. Right Language, Declared Scope | ✅ | The table below lists every path. The TS backend fits the default "TypeScript (Node): services that share code with a web app". The generator is Node, like `infra/scripts/new-project.mjs`, because pnpm and Node are already required. |
| III. Contracts at the Seams | ✅ | No cross-language calls are added. The shared `/health` shape is documented in [contracts/health.openapi.yaml](./contracts/health.openapi.yaml) so all backend templates agree. |
| IV. Tests Prove It | ✅ | Each template ships with a test. The new `nodeWebCode` / `HttpLambda` node path gets a construct test. US3 is proven by the CI scaffold job. |
| V. One Command Surface | ✅ | `just new-go/new-py/new-web/new-ts` and `just test-templates`. Scaffolded apps are discovered by the existing globs. |
| VI. Disposable by Design | ✅ | An app is 2 folders plus a workspace entry. Templates add no runtime coupling between apps. |
| Infrastructure | ✅ | One CDK app per project, named after the app. Pay-per-use only (Lambda, HTTP API, S3, CloudFront). Everything is destroyable. Each project depends only on `infra/common`. |
| Layout table | ⚠️ amend | `templates/` is a new top-level folder. Amend the constitution with `/speckit-constitution` (MINOR → 1.3.0) as part of this feature (FR-014). |
| Commit Authorship | ✅ | No change. |

**Expected monthly cost** (idle `dev`, per project): Lambda, HTTP API and CloudWatch Logs cost $0 at zero traffic. S3 plus CloudFront for the web app costs a few cents. Total stays under $1 (SC-006).

**Post-design re-check**: still passes. The design adds no cross-app imports, no always-on resources and no new IaC tool.

## Project Structure

### Documentation (this feature)

```text
specs/002-app-templates/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   ├── scaffold-cli.md       # just new-<kind> command contract
│   └── health.openapi.yaml   # shared GET /health for backend templates
└── tasks.md             # Phase 2 (/speckit-tasks, not created here)
```

### Source Code (BlueBelle monorepo)

```text
templates/                         # NEW: not in any workspace; ignored by biome/ruff
├── README.md                      # placeholders, how to add a kind
├── go/
│   ├── app/                       # → apps/<base>-go
│   │   ├── go.mod                 # module bluebelle/apps/__NAME__
│   │   ├── handler.go             # package __PKG__; NewMux, GET /health
│   │   ├── handler_test.go        # table-driven
│   │   ├── cmd/__BASE__/main.go
│   │   └── README.md
│   └── infra/                     # → infra/projects/<base>-go  (HttpLambda + goWebCode)
├── py/
│   ├── app/                       # → apps/<base>-py
│   │   ├── pyproject.toml         # name __NAME__, script __NAME__ = __PKG__.main:run
│   │   ├── src/__PKG__/{__init__,main}.py
│   │   ├── tests/test_health.py
│   │   └── README.md
│   └── infra/                     # HttpLambda + pythonWebCode("__PKG__.main:app")
├── web/
│   ├── app/                       # → apps/web-<base> (from apps/web-react, minus dist/node_modules)
│   └── infra/                     # StaticSite + prepare-app script
└── ts/
    ├── app/                       # → apps/<base>-ts
    │   ├── package.json           # hono, @hono/node-server; build/test/dev/start
    │   ├── tsconfig.json
    │   ├── src/app.ts             # export const app = new Hono(); GET /health
    │   ├── src/server.ts          # serve({ fetch: app.fetch, port: PORT ?? 3000 })
    │   ├── src/app.test.ts        # app.request("/health")
    │   └── README.md
    └── infra/                     # HttpLambda language "node" + nodeWebCode

scripts/new-app.mjs                # NEW generator: validate → collision check → copy+substitute → register

infra/common/src/http-lambda.ts    # MODIFIED: WebLanguage += "node"; nodeWebCode()
infra/common/src/index.ts          # MODIFIED: export nodeWebCode
infra/common/test/http-lambda.test.ts  # MODIFIED: node case
infra/common/package.json          # MODIFIED: + esbuild

apps/api-go, apps/svc-py, apps/web-react     # REGENERATED from templates
apps/api-ts                                  # NEW sample (just new-ts api)
infra/projects/{api-go,svc-py,web-react}     # REGENERATED
infra/projects/api-ts                        # NEW

justfile                           # MODIFIED: new-go/new-py/new-web via generator; + new-ts, test-templates
biome.json, pyproject.toml         # MODIFIED: exclude templates/
.github/workflows/templates.yml    # NEW: scaffold every kind, lint/test/build/synth
.github/workflows/ts.yml           # unchanged (already covers apps/*-ts)
README.md, CLAUDE.md, infra/README.md, .specify/memory/constitution.md   # MODIFIED docs
```

| Path | Language | New / Modified | Why this language |
|------|----------|----------------|-------------------|
| `templates/go` | Go | New | Default for services (II). |
| `templates/py` | Python | New | Default for quick backend prototypes (II). |
| `templates/web` | React + TS | New | Default for browser UIs (II). |
| `templates/ts` | TypeScript (Node, Hono) | New | Default for services that share code with a web app (II). |
| `scripts/new-app.mjs` | Node (ESM) | New | Same as `infra/scripts/new-project.mjs`; Node is already required. |
| `infra/common` | TypeScript (CDK) | Modified | The only IaC tool (Infrastructure). |
| `apps/api-go`, `svc-py`, `web-react`, `api-ts` | per kind | Regenerated / New | Template output (US4). |
| `infra/projects/*` (4) | TypeScript (CDK) | Regenerated / New | One CDK app per project. |

**Structure Decision**: Templates live in one top-level `templates/<kind>/{app,infra}` tree that sits outside every workspace glob. That keeps them out of `go.work`, the uv members and the pnpm packages. One generator script handles all kinds, so collision checks, placeholder rules and registration are implemented once. `just new-infra` (empty stack) and `infra/scripts/new-project.mjs` stay for stacks that don't belong to an app, such as `shared`.

## Complexity Tracking

No violations. The `templates/` layout amendment is handled through `/speckit-constitution`, not as a deviation.
