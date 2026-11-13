# Quickstart & Validation: SuperLens

How to run SuperLens locally, deploy it, and prove each user story works. The interface is described in
[contracts/superlens.openapi.yaml](./contracts/superlens.openapi.yaml) and the storage in
[data-model.md](./data-model.md).

## Prerequisites

- `just setup` done; tools from `.mise.toml` on PATH.
- For deploy only: an AWS profile with permission in `ap-southeast-2`, `just cdk-bootstrap` already run once,
  and an email address for the budget alert and Cognito invite.

## 1. Local checks (no AWS)

```sh
just lint test                 # all languages, includes the new apps and infra/projects/superlens
just test-go                   # Go: adapters (recorded fixtures), merge/delta, calc goldens, API handlers
just test-ts                   # web: calc goldens, chart and watchlist components, CDK assertions
just infra-synth superlens     # CloudFormation builds without AWS credentials
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

Expected: http://localhost:5173 shows public series. Local mode accepts the fixed dev token `dev-owner` for
owner features.

## 2. Deploy (owner approval required each time)

```sh
just infra-diff superlens
just infra-deploy superlens          # → stack bb-superlens-dev; outputs Url, UserPoolId
```

After the first deploy:

1. Accept the Cognito invite email, set a password and enrol TOTP MFA.
2. Confirm the budget-alert subscription email.
3. In the CloudFront console, subscribe the distribution to the **Free flat-rate plan** if eligible
   (research R9).
4. Trigger the first backfill: sign in → **Refresh**. Backfill continues automatically across runs until
   every source reports `backfill: complete`.

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
| V10 | FR-016, SC-001a | In a private window (signed out) | Public option and FX charts visible; indices, watchlist, Refresh and keys are absent; `GET /api/v1/series` returns `401` |
| V11 | FR-015a, SC-001b | Create a key in **Settings → Access keys**; then `curl -H "X-Api-Key: $KEY" "$URL/api/v1/series/australiansuper.balanced/values?from=2016-01-01&to=2026-01-01"` | 200 in under 3 s |
| V12 | SC-001a | Revoke that key; repeat V11 | `401` on the very next request |
| V13 | SC-001c, R9 | `for i in $(seq 1 2000); do curl -s -o /dev/null "$URL/data/v1/manifest.json?x=$i"; done` | CloudFront metrics show cache hit rate > 99%; S3 GETs barely move; no Lambda invocations |
| V14 | MCP (R15) | Add the server to Claude Code (below), ask "compare High Growth with the S&P 500 in AUD over FY2026" | Claude calls `compare_performance`; the figures match V6/V7; includes the disclaimer |

### MCP setup for V14

```sh
cd apps/superlens-go && go build -o ~/bin/superlens-mcp ./cmd/superlens-mcp
claude mcp add superlens --env SUPERLENS_URL=$URL --env SUPERLENS_API_KEY=$KEY -- ~/bin/superlens-mcp
```

The key goes in your local Claude config, never in the repo.

## 4. Tear down

```sh
just infra-destroy superlens        # owner approval required; removes everything, including data
```
