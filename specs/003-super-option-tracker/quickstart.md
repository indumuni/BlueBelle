# Quickstart & Validation: SuperLens

How to run SuperLens locally, deploy it, and prove each user story works. The interface is described in
[contracts/superlens.openapi.yaml](./contracts/superlens.openapi.yaml) and the storage in
[data-model.md](./data-model.md).

## Prerequisites

- `just setup` done; tools from `.mise.toml` on PATH.
- For deploy only: an AWS profile with permission in `ap-southeast-2`, `just cdk-bootstrap` already run once,
  and an email address for the budget alert.

## 1. Local checks (no AWS)

```sh
just lint test                 # all languages, includes the new apps and both infra projects
just test-go                   # Go: adapters (recorded fixtures), merge/delta, calc goldens, API handlers
just test-ts                   # web: calc goldens, chart and watchlist components, CDK assertions
just infra-synth superlens-go     # backend; CloudFormation builds without AWS credentials
just infra-synth web-superlens    # frontend; warns that SUPERLENS_BACKEND_DOMAIN is unset (expected)
```

Expected: all pass. Both `internal/calc` (Go) and `src/lib/calc.ts` (web) pass every file in
`contracts/superlens/fixtures/` (SC-004 seam test).

### Run the stack locally

```sh
# terminal 1: API against a local data directory instead of S3/DynamoDB
cd apps/superlens-go && SUPERLENS_STORE=file://./.localdata go run ./cmd/superlens
# terminal 2: one update run against the same store (real sources, small range)
cd apps/superlens-go && SUPERLENS_STORE=file://./.localdata go run ./cmd/superlens-update -since 2026-10-01
# terminal 3: web app, proxying /data and /api to the local API
cd apps/web-superlens && pnpm dev
```

Expected: http://localhost:5173 shows every series, the watchlist and Refresh (v1 has no sign-in, research R18).

## 2. Deploy (owner approval required each time)

Two independent projects (research R17). Deploy the backend first, because the frontend needs its CloudFront
domain:

```sh
# 1. Backend: data, API, update job, backend distribution
just infra-diff superlens-go
just infra-deploy superlens-go                 # → bb-superlens-go-dev; outputs BackendDomain

# 2. Frontend: site plus /data and /api proxied to the backend
export SUPERLENS_BACKEND_DOMAIN=<BackendDomain from step 1>
just infra-deploy web-superlens                # → bb-web-superlens-dev; outputs Url
```

To skip re-typing it, keep the export in a gitignored `infra/.env.dev` and `source infra/.env.dev` before
deploying. After the first time, deploy either project on its own.

After the first deploy:

1. Confirm the budget-alert subscription email.
2. In the CloudFront console, subscribe **both** distributions to the **Free flat-rate plan** if eligible
   (research R9, R17).
3. Trigger the first backfill: open the web `Url` → **Refresh**. Backfill continues automatically across runs
   until every source reports `backfill: complete`.
4. Keep the URL to yourself: v1 has no sign-in (research R18).

In the scenarios below, `$URL` is the **web** URL (step 2) and `$API` is `https://<BackendDomain>`.

## 3. Validation scenarios

| # | Story / Req | Steps | Expected |
|---|---|---|---|
| V1 | US1, FR-002 | After deploy, check **Sources** in the UI (or `GET /api/v1/sources`) after the backfill runs | Each source `backfill.state = complete`; series `firstDate` is the earliest date the provider has |
| V2 | US1, FR-003/005, SC-002 | Next day, open the latest run (`GET /api/v1/runs?limit=1`) | `perSource[].from` is no earlier than 5 business days before the previous `lastDate`; `daysAdded` ≥ 0 |
| V3 | US1.3 | Press Refresh twice within 5 minutes | Second press: "Updated less than 5 minutes ago" (`429`) |
| V4 | US1.4, FR-007 | In `dev`, set the `SUPERLENS_FAULT=australiansuper` env var on the update Lambda; Refresh | Run `partial`; that source's data unchanged; the UI shows its last successful update time and the error |
| V5 | US1.5 | Next morning after 07:00 Sydney time, open the app | Latest run `trigger = schedule`, `succeeded`; no manual action needed (SC-001) |
| V6 | US2, SC-003/004 | Chart two options over 1Y; compare `totalReturnPct` with a spreadsheet using the provider CSV | Match within 0.01 pp; changing period redraws in < 2 s (DevTools: no network requests apart from new chunks) |
| V7 | US3, FR-006e | Add S&P 500, toggle AUD ↔ local | Line changes; the "AUD view" / "Local currency" label switches; "price index" note shown |
| V8 | US4 | Mark 2 options invested and 1 considering; reload on your phone | The same three options open by default, grouped; usable at phone width (FR-016a) |
| V9 | US5 | Open the snapshot when data is stale (e.g. temporarily disable the schedule) | Stale warning shown |
| V10 | FR-016b, SC-001a | Try to add data through the address: `curl -X POST $URL/api/v1/sources/australiansuper/imports` and `curl -X PUT $URL/data/v1/manifest.json` | Both refused (`404`/`403`); the only way to import is `superlens-mcp import` with your AWS profile |
| V11 | FR-015a, SC-001b | `curl "$API/api/v1/series/australiansuper.balanced/values?from=2016-01-01&to=2026-01-01"` (no credentials) | 200 in under 3 s; repeating it within 5 minutes is a CloudFront cache hit (`x-cache: Hit from cloudfront`) |
| V12 | R7, FR-016b | `AWS_PROFILE=<you> superlens-mcp import australiansuper sample.csv` | A run with `trigger = import` appears in `GET /api/v1/runs`; the data shows the imported days |
| V13 | SC-001c, R9 | Run `for i in $(seq 1 2000); do curl -s -o /dev/null "$URL/data/v1/manifest.json?x=$i"; done`, then the same against `$API` | Both distributions show cache hit rate > 99%; S3 GETs barely move; no Lambda invocations |
| V14 | MCP (R15) | Add the server to Claude Code (below), ask "compare High Growth with the S&P 500 in AUD over FY2026" | Claude calls `compare_performance`; the figures match V6/V7; includes the disclaimer |
| V15 | R17 | `curl $URL/api/v1/sources` and `curl $API/api/v1/sources` | Same JSON from both (proxied to the backend unchanged) |
| V16 | R17 | After a manual Refresh that adds a day, reload the web app | The new day appears within 1 minute (frontend manifest TTL ≤ 60 s) |

### MCP setup for V14

```sh
cd apps/superlens-go && go build -o ~/bin/superlens-mcp ./cmd/superlens-mcp
claude mcp add superlens --env SUPERLENS_URL=$API -- ~/bin/superlens-mcp
```

No key is needed in v1 (research R18).

## 4. Tear down

```sh
just infra-destroy web-superlens     # owner approval required; removes the site
just infra-destroy superlens-go      # owner approval required; removes data and API
```
