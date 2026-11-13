# Implementation Plan: Super Investment Option Tracker (SuperLens)

**Branch**: `003-super-option-tracker` | **Date**: 2026-11-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-super-option-tracker/spec.md`

## Summary

SuperLens keeps its own history of AustralianSuper's daily option returns, four market indices and AUD
exchange rates. It brings that history up to date by fetching only the missing days (plus a 5-day re-check),
every morning at 07:00 Sydney time and whenever the owner presses Refresh. It charts the data on any device.

The design is **static-first and serverless**:

- A Go update job writes each series as **immutable, content-hashed year chunks** in S3.
- One CloudFront distribution serves the React app, the public data (from cache) and a small owner-only Go
  API (Lambda Function URL, reachable only through CloudFront).
- Public data (options and FX) costs nothing per view. Private data (indices, watchlist, keys) needs the
  owner's Cognito sign-in or an access key.
- Cheap layers guard against floods: cache-only public path, origin lockdown, an edge pre-filter, reserved
  concurrency, the CloudFront free flat-rate plan, and a budget alarm.
- A Go **MCP server** and a **Claude skill** let Claude analyse the data directly.

Expected cost: about **$0.10 a month**. Every decision is explained in [research.md](./research.md).

**Owner inputs reflected**: minimal cost and serverless (R2, R16); Go for learning (R3, R10); caching of daily
data (R5); public general data (R6, spec FR-016 amended); cheap DDoS protection (R9); AI workflows, MCP,
skills and RAG (R15).

## Technical Context

**Language/Version**: Go 1.27.3; TypeScript 7 (strict) on Node 24 with React 19 and Vite 8; CDK in TypeScript.
All pinned in `.mise.toml`.

**Primary Dependencies**:
- Go: `aws-sdk-go-v2` (s3, dynamodb, lambda, cloudfront); `aws-lambda-go`; `oapi-codegen` v2 (std-http
  strict server, dev tool); `golang-jwt/jwt/v5` + `MicahParks/keyfunc/v3`; `golang.org/x/crypto/argon2`;
  `golang.org/x/sync/errgroup`; `oklog/ulid/v2`; `modelcontextprotocol/go-sdk`.
- Web: `lightweight-charts`; `oidc-client-ts`; `openapi-typescript` (dev, generates types from the contract).
- Infra: `aws-cdk-lib` (existing).

**Storage**: S3 (immutable year chunks plus manifests) and one on-demand DynamoDB table (metadata and state).
See [data-model.md](./data-model.md).

**Testing**:
- Go: table-driven `go test`. Source adapters are tested against recorded responses in `testdata/`; HTTP
  handlers with `httptest`; the store through an interface with in-memory and file fakes.
- Web: Vitest + Testing Library.
- Seam: golden calculation fixtures shared by Go and TS ([contracts/fixtures.md](./contracts/fixtures.md)).
- Infra: Vitest with CDK `Template` assertions (OAC, reserved concurrency, cache policies, schedule time zone,
  budget).

**Target Platform**: AWS `ap-southeast-2`: Lambda arm64 (`provided.al2023`), S3, DynamoDB, CloudFront, Cognito,
EventBridge Scheduler. Browsers on desktop and phone. The MCP server runs on the owner's macOS.

**Project Type**: Web application (SPA + serverless API + scheduled job) plus a local MCP/CLI tool.

**Performance Goals**:
- Watchlist chart visible in under 5 s on a normal morning (SC-001).
- Redraws in under 2 s with 25 years of data (SC-003).
- 10 years of one series through the data interface in under 3 s (SC-001b).

**Constraints**:
- About $0 fixed monthly cost; worst case capped (SC-001c).
- No always-on compute; no secrets in the repo.
- Never bypass the provider's bot protection (R7).
- Present data only, no advice (FR-017).
- Every stack destroyable.

**Scale/Scope**: 1 owner plus anonymous viewers. About 40 series and 260 k points over 25 years. 1 scheduled
run a day. Web: about 6 screens (Chart, Snapshot, Watchlist, Sources/Runs, Access keys, Sign-in).

**Open item (does not block the plan)**: whether the AustralianSuper endpoint can be fetched from Lambda.
Task T001 (spike) decides between the direct fetch and the owner-assisted import fallback (R7). Both are
designed and contracted.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / Rule | Status | Notes |
|---|---|---|
| I. Spec Before Substance | ✅ | Spec 003, clarified (4 Q&A) and amended for public data. |
| II. Right Language, Declared Scope | ✅ | Table below. Go for the services, job and CLI/MCP; React + TS for the UI. Both are defaults. |
| III. Contracts at the Seams | ✅ | Go ↔ TS through `contracts/superlens.openapi.yaml` (API **and** static manifest/chunk shapes). TS types are generated with openapi-typescript; Go server and types with oapi-codegen. Golden calculation fixtures test the seam. |
| IV. Tests Prove It | ✅ | Every user story maps to automated tests (Go handlers and adapters, web components, calc goldens, CDK assertions) plus quickstart V1–V14. |
| V. One Command Surface | ✅ | Apps are scaffolded with `just new-go superlens` / `just new-web superlens`, so `just lint test build` covers them. The infra project is reached by `just infra-*`. Code generation runs through `go generate` and a pnpm script, both wired into `just build`. |
| VI. Disposable by Design | ✅ | Apps import only from `packages/` (none needed). Delete the 2 apps, the infra project, the skill and the `go.work` entry to remove it all. |
| Infrastructure: CDK TS, per-project app, tags, destroyable | ✅ | `infra/projects/superlens` uses `createProjectApp`; stack `bb-superlens-<stage>`; buckets `autoDeleteObjects`, table `RemovalPolicy.DESTROY`. |
| Infrastructure: infra named after `apps/<name>` | ⚠️ | One infra project `superlens` deploys **two** apps. Justified under Complexity Tracking. |
| Infrastructure: projects don't depend on each other | ✅ | Self-contained; does not use `shared` (no VPC needed). |
| Infrastructure: cost listed, serverless preferred | ✅ | R16: about $0.10/month; all pay-per-use. |
| Infrastructure: deploys local only | ✅ | CI synthesizes only; quickstart marks every deploy as needing owner approval. |
| Commit Authorship | ✅ | No AI attribution in commits or PRs. |

**Post-design re-check (after Phase 1)**: unchanged. The contracts, data model and quickstart add no new
violations. The `HttpLambda` change in `infra/common` is reusable and tested there (Principle: "new reusable
patterns go there, with tests").

## Project Structure

### Documentation (this feature)

```text
specs/003-super-option-tracker/
├── spec.md
├── plan.md              # this file
├── research.md          # R1–R16 decisions
├── data-model.md
├── quickstart.md        # run + validation scenarios V1–V14
├── contracts/
│   ├── superlens.openapi.yaml   # promoted to contracts/superlens.openapi.yaml in T002
│   ├── mcp-tools.md
│   └── fixtures.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks (not created here)
```

### Source Code (BlueBelle monorepo)

```text
contracts/
├── superlens.openapi.yaml            # NEW: API + static data shapes (canonical)
└── superlens/fixtures/*.json         # NEW: golden calc fixtures (Go + TS)

apps/superlens-go/                    # NEW (just new-go superlens)
├── cmd/
│   ├── superlens/main.go             # owner API server (net/http; Lambda via Web Adapter; local)
│   ├── superlens-update/main.go      # update job (aws-lambda-go): schedule, refresh, import
│   └── superlens-mcp/main.go         # local MCP server (stdio) + `import` subcommand
├── internal/
│   ├── api/                          # handlers implementing the generated strict server; auth middleware
│   ├── apigen/                       # oapi-codegen output (go:generate)
│   ├── auth/                         # Cognito JWT (JWKS), access keys (argon2id)
│   ├── calc/                         # compounding, rebase, stats, AUD conversion (+ golden tests)
│   ├── series/                       # chunking, hashing, merge/delta, business-day logic
│   ├── source/                       # Adapter interface; australiansuper/, yahoo/, frankfurter/
│   ├── store/                        # S3 + DynamoDB impl; file + memory impls for local/tests
│   └── update/                       # run orchestration: lock, backfill cursor, manifest, invalidation
├── testdata/                         # recorded provider responses (from the spike)
└── go.mod                            # module bluebelle/apps/superlens-go

apps/web-superlens/                   # NEW (just new-web superlens)
└── src/
    ├── api/                          # generated types + fetch client (adds x-amz-content-sha256)
    ├── auth/                         # oidc-client-ts (Cognito PKCE)
    ├── lib/calc.ts                   # same formulas as Go (+ golden tests)
    ├── data/                         # manifest + chunk loader (browser HTTP cache)
    ├── components/                   # Chart, PeriodPicker, SeriesPicker, CurrencyToggle, StatsTable
    └── pages/                        # Chart, Snapshot, Watchlist, Sources, AccessKeys

infra/projects/superlens/             # NEW (just new-infra superlens)
├── lib/stack.ts                      # S3 data + site buckets, DynamoDB, 2 Lambdas, Function URL+OAC,
│                                     # CloudFront (3 behaviours + edge function), Cognito, Scheduler,
│                                     # Budget + anomaly monitor
├── lib/edge/api-prefilter.js         # CloudFront Function (cloudfront-js-2.0)
└── test/stack.test.ts

infra/common/src/http-lambda.ts       # MODIFIED: frontDoor "httpApi" (default) | "functionUrl" (IAM, for OAC);
infra/common/test/                    #           reservedConcurrency option; tests
infra/README.md                       # MODIFIED: document the new HttpLambda options

.claude/skills/superlens-analyst/SKILL.md   # NEW: Claude skill using the MCP tools (R15)
go.work                                     # MODIFIED by the scaffold (adds ./apps/superlens-go)
```

| Path | Language | New / Modified | Why this language |
|------|----------|----------------|-------------------|
| `apps/superlens-go` | Go | New | Owner's learning goal; constitution default for services, jobs and CLIs; small, fast Lambda binaries |
| `apps/web-superlens` | React + TS | New | Constitution default for browser UIs |
| `contracts/superlens.openapi.yaml`, `contracts/superlens/fixtures` | OpenAPI / JSON | New | Go ↔ TS seam (Principle III) |
| `infra/projects/superlens` | TS (CDK) | New | CDK is the only IaC tool |
| `infra/common` (`HttpLambda`) | TS (CDK) | Modified | Reusable "Lambda only reachable through CloudFront" pattern |
| `.claude/skills/superlens-analyst` | Markdown | New | Claude Code skill format |

**Structure Decision**: Two apps scaffolded with the existing generators. The scaffolders also create
`infra/projects/superlens-go` and `infra/projects/web-superlens`; both are **deleted** and replaced by the
single `infra/projects/superlens` (see Complexity Tracking). The Go module holds three binaries that share
internal packages. The web app reads public data straight from `/data/v1/*` and everything else through
`/api/v1/*` on the same origin.

## Delivery order (input for /speckit-tasks)

1. **T001 spike** (time-boxed, 1 day). Verify R7 (provider access from a laptop and from Lambda, CSV
   layout, earliest date, range limit), R8 (Yahoo and Frankfurter responses) and R9 (flat-rate plan
   eligibility). Record sample responses in `testdata/`. Decide between fetch and import.
2. **Foundation**: scaffold the apps and infra project, promote the contract, generate code, add the
   `HttpLambda` changes, golden fixtures.
3. **US1 (P1)**: adapters, merge/delta, chunks and manifest, update job, lock, backfill, schedule, sources and
   runs API.
4. **US2 (P1)**: web chart, period presets, stats, hover values; public data path. **MVP = US1 + US2 deployed.**
5. **US3 (P2)**: index and FX adapters, AUD toggle, private chunk API.
6. **US4 (P2)**: Cognito sign-in, watchlist and preferences.
7. **US5 (P3)**: snapshot and stale warning.
8. **Data interface and AI (FR-015a/b)**: access keys, values, performance and export endpoints; MCP server;
   `superlens-analyst` skill.
9. **Hardening**: edge pre-filter, reserved concurrency, budget, flood test V13, quickstart V1–V14.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| One infra project (`superlens`) deploys two apps (`superlens-go`, `web-superlens`) instead of one infra project per app | A **single CloudFront origin** for the site, public data and API: one free flat-rate plan, no CORS, same-origin auth headers, origin lockdown with OAC, and one deploy/destroy unit | Two projects would mean two distributions (double the attack surface and plan subscriptions), CORS, and the web project needing the API project's URL. That is a cross-project dependency the constitution forbids. |
| Two ways to get AustralianSuper data (fetch and owner-assisted import) | The provider's CDN refused a plain client during research (R7), and we must not bypass bot protection | Fetch-only might not work from AWS at all; import-only gives up the 07:00 automation if fetching does work. The spike picks the active mode, and the other stays as a tested fallback. |
