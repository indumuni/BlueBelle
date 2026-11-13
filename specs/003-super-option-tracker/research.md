# Research: Super Investment Option Tracker (SuperLens)

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-11-12

Each section records a decision, why it was made, and what else was considered. Items marked
**VERIFY IN SPIKE** are assumptions that task T001 (data-source spike) must confirm before the
dependent code is written.

---

## R1. App name

- **Decision**: **SuperLens**. Apps `apps/superlens-go` and `apps/web-superlens`; infra
  `infra/projects/superlens`; stacks `bb-superlens-<stage>`.
- **Rationale**: Short, fits the repo's `<name>-go` / `web-<name>` naming, and avoids using the provider's
  brand in the product name.
- **Alternatives**: AustralianSuperVisualizer (long, uses the brand), SuperPulse, OptionWatch. Renaming is
  a find-and-replace until the apps are scaffolded.

## R2. Overall shape: static-first, serverless, one CloudFront front door

- **Decision**: Precompute data into **immutable JSON files in S3** and serve them through **one CloudFront
  distribution**, which also serves the web app (`/*`), public data (`/data/*`) and the private API
  (`/api/*`). Compute runs only for (a) the daily/manual update and (b) owner-only API calls.
- **Rationale**: The data changes once a day and past days never change after the 5-day re-check window, so
  the read path can be almost entirely cache hits. That gives the lowest cost (no compute per chart view),
  the fastest charts (SC-001, SC-003) and the best protection against floods (R9), because anonymous traffic
  never reaches anything that costs money per request beyond CloudFront.
- **Alternatives**:
  - API Lambda computes every chart query: simple, but every view costs compute and floods hit Lambda.
  - Always-on container/VM: costs money 24/7; rejected for cost.

## R3. Languages (constitution Principle II)

| Part | Language | Why |
|---|---|---|
| Update job, API, MCP server | **Go** | Owner wants to learn Go; constitution default for services and CLIs; tiny, fast-starting Lambda binaries on arm64 (cold start ~100 ms), cheapest Lambda profile. |
| Web UI | **React + TypeScript** | Constitution default for browser UIs; existing `web` template. |
| Infra | **TypeScript (CDK)** | Constitution: CDK in TS is the only IaC tool. |
| Python | not used in v1 | Reserved for the RAG follow-up and personal notebooks that call the data interface. |

## R4. Data storage

- **Decision**:
  - **Series values** → S3, one JSON **chunk per series per calendar year**, content-addressed
    (`<year>.<hash>.json`), so every chunk is immutable and cacheable forever. A small **manifest** lists
    series and their current chunk URLs; it is the only file that changes daily.
  - **Metadata and state** (sources, series catalogue, watchlist, access keys, update runs, backfill cursor,
    update lock) → one **DynamoDB** table, on-demand billing.
- **Rationale**: Full history is tiny (≈40 series × 25 years × 260 days ≈ 260 k points, a few MB of JSON). A
  year chunk is ≤ 10 KB gzipped, so a 25-year chart is ~25 cached requests made in parallel. DynamoDB gives
  conditional writes for the lock and access keys, and on-demand pricing is effectively free at this size
  (well inside the always-free 25 GB).
- **Alternatives**:
  - All values in DynamoDB: needs Lambda on every read, so no cache-only read path.
  - SQLite or Parquet on S3: neat, but needs compute to query and is harder for the browser to read.
  - Aurora Serverless / RDS: minimum monthly cost; rejected.

## R5. Caching strategy

- **Decision**:
  - Chunks: `Cache-Control: public, max-age=31536000, immutable` (content hash in the name, so they never go
    stale).
  - Public manifest `/data/v1/manifest.json`: `max-age=60, s-maxage=86400`. After every successful update
    the job writes a new manifest and **invalidates that one path** (the first 1,000 invalidation paths a
    month are free; we use ~31).
  - Private chunks via `/api/v1/series/{id}/chunks/{year}`: `Cache-Control: private, max-age=31536000,
    immutable` for closed years, `private, max-age=300` for the current year. Browser cache only.
  - The CloudFront cache policy for `/data/*` **ignores all query strings, headers and cookies**, and error
    responses (403/404) are cached for 60 s.
  - The Go API keeps a small in-memory LRU of decoded chunks keyed by hash (safe because they're immutable).
- **Rationale**: Gives the owner's request for caching: after first load, charts need only one small
  manifest request per day. Ignoring query strings stops "cache-busting" floods from reaching S3.
- **Alternatives**: Fixed TTLs without content hashes (forces a choice between stale data and frequent
  misses); a separate cache service such as ElastiCache (always-on cost).

## R6. Public vs private data (spec FR-016 as amended)

- **Decision**: Each data source has a `visibility`.
  - **Public**: AustralianSuper options (published openly by the fund; **VERIFY IN SPIKE** that the
    website terms allow republishing; if not, make the source private, a one-field change) and exchange
    rates (ECB reference rates, free to reuse with attribution).
  - **Private**: market indices from the index source (R8), whose terms do not allow republishing.
  - Public series go in `s3://…/data/v1/` (served by CloudFront). Private series go in `s3://…/private/`,
    which no CloudFront behaviour serves, so they can only be read through the authenticated API.
- **Rationale**: Meets the owner's wish to share general data at no extra cost while respecting data
  licences. The watchlist and actions are always private.
- **Alternatives**: Everything public (licence risk); everything private (loses free caching and sharing).

## R7. AustralianSuper daily rates source — **VERIFY IN SPIKE**

- **Finding (2026-11-12)**: A plain HTTP client request to the download endpoint from the planning
  environment returned **HTTP 403 "Access Denied"** from the provider's CDN (bot protection). The same URL
  works in the owner's browser. We did not try to get around the protection, and the implementation must
  not either.
- **Decision**:
  1. Spike T001 checks, from the owner's machine and from an AWS Lambda in `ap-southeast-2`, whether a
     plainly identified client (`User-Agent: SuperLens/1.0 (personal use)`) can fetch the CSV. It also
     records the CSV layout (columns, date format, option identifiers), the earliest available date, the
     longest range allowed in one request, and when each day's rate appears.
  2. **If Lambda can fetch it**: the update job fetches it directly (primary design).
  3. **If only the owner's machine can fetch it**: fall back to **owner-assisted import**. The owner (or the
     Claude skill on the owner's machine) downloads the CSV exactly as today, and `superlens import <file>`
     uploads it through the authenticated `POST /api/v1/sources/{id}/imports` endpoint. The update job then
     processes it in the same way (same validation, delta merge and manifest rebuild). The 7:00 schedule
     still updates FX and indices. Rates arrive whenever the owner imports.
  4. Check the provider's website terms on automated access during the spike. If they forbid it, use (3).
- **Rationale**: Automation must not depend on defeating a bot shield. The importer keeps every other part
  of the design unchanged, so the decision can wait until the spike.
- **Assumed format** (to verify): one row per date, one column per investment option, values are daily %
  returns when `cumulative=False`, dates `dd/mm/yyyy`, Sydney business days only.

## R8. Index and exchange-rate sources — **VERIFY IN SPIKE**

| Series | Source (primary) | Fallback | Notes |
|---|---|---|---|
| ASX All Ordinaries | Yahoo Finance chart endpoint `^AORD` | Stooq CSV `^aor` | Unofficial, keyless; terms forbid republishing → **private** |
| S&P 500 | Yahoo `^GSPC` | Stooq `^spx`; FRED `SP500` (10 yrs only) | private |
| FTSE 100 | Yahoo `^FTSE` | Stooq `^ukx` | private |
| MSCI Emerging Markets | Yahoo `EEM` (iShares MSCI EM ETF, USD) as **proxy** | MSCI end-of-day download (manual) | No free daily feed for the index itself; labelled "MSCI EM (EEM proxy)" |
| AUD/USD, AUD/GBP | **Frankfurter** (ECB reference rates), keyless JSON, history from 1999-01-04 | RBA F11 historical series | public, attribution "Source: ECB" |

- **Important caveat, shown in the UI**: the index series are **price indices** (no reinvested
  dividends), while super option returns include income and are after fees and tax. Comparisons therefore
  favour the super options by roughly the dividend yield (~3–4% a year for the ASX). The UI labels index
  lines "price index". Total-return (accumulation) indices can be added later as another source.
- **Rationale**: Free and keyless (no secrets to manage), with long history. Each source is one Go adapter
  behind a common interface (R10), so swapping is cheap if Yahoo changes.
- **Alternatives**: Alpha Vantage / Twelve Data (free tiers need keys and have small daily quotas);
  paid feeds (cost).

## R9. Cheap protection against floods and denial of service

Layered, with zero or near-zero fixed cost:

1. **Single CloudFront front door.** AWS Shield Standard (network-layer DDoS) is automatic and free. S3 and
   Lambda are reachable **only** through CloudFront: S3 via Origin Access Control, Lambda via a **Function
   URL with `AuthType: AWS_IAM` + CloudFront OAC**. There is no public API Gateway endpoint to attack
   directly.
2. **CloudFront flat-rate "Free" plan** ($0/month; includes AWS WAF with managed rules, a rate-based rule
   and DDoS protection, with **no overage charges**: traffic beyond the allowance is degraded, not billed).
   **VERIFY IN SPIKE** that the distribution's features (Function URL + OAC origin, CloudFront Function)
   are eligible. If not, use pay-as-you-go CloudFront, whose always-free tier (10 M requests and 1 TB a
   month) already covers normal use; skip paid WAF (~$6+/month) and rely on the layers below.
3. **Cache-only public path**: anonymous traffic hits only cached `/` and `/data/*` content; cache keys
   ignore query strings, headers and cookies; errors are cached.
4. **CloudFront Function on `/api/*`** (~$0.10 per million): rejects requests that carry neither an auth
   token nor an API-key header before they reach Lambda, and enforces `GET` on reads.
5. **Lambda reserved concurrency**: API = 5, update job = 1. This caps the worst-case compute bill and also
   enforces one update at a time.
6. **Refresh cooldown**: a DynamoDB lock with a 15-minute lease, and refresh refused within 5 minutes of the
   last run (FR-018).
7. **Cognito**: self sign-up disabled, one admin-created owner, **TOTP MFA required** (free).
8. **Budget alarm**: AWS Budgets at $5/month (two budgets are free) plus Cost Anomaly Detection (free),
   both emailing the owner. This is the backstop for SC-001c.
- **Alternatives**: Paid WAF on pay-as-you-go (~$6–10/month fixed); API Gateway usage plans (only on REST
  APIs, and the endpoint stays public); Shield Advanced ($3,000/month).

## R10. Go design

- **Decision**: One Go module `apps/superlens-go` with three binaries:
  - `cmd/superlens` — HTTP API server (the template's server; runs on Lambda through the Lambda Web Adapter,
    and locally with `go run`). Standard library `net/http` routing; handlers generated as a strict server
    from the OpenAPI contract with **oapi-codegen** (std-http mode).
  - `cmd/superlens-update` — update job (`aws-lambda-go`), triggered by EventBridge Scheduler, by the API
    (async invoke), or by an import.
  - `cmd/superlens-mcp` — local MCP server (stdio) for Claude and other AI tools, built on the official
    `github.com/modelcontextprotocol/go-sdk`. It calls the data interface with an access key. It also hosts
    the `import` subcommand from R7.
  - Internal packages: `source` (adapter interface + `australiansuper`, `yahoo`, `frankfurter`),
    `series` (merge, delta, chunking, hashing), `calc` (compounding, drawdown, AUD conversion), `store`
    (S3 + DynamoDB), `auth` (Cognito JWT via JWKS with `golang-jwt/jwt/v5` + `MicahParks/keyfunc/v3`,
    access-key hashing), `api` (handlers).
- **Rationale**: Covers a broad slice of Go (HTTP servers, Lambda handlers, AWS SDK v2, concurrency for
  parallel fetches with `errgroup`, generics in the series code, code generation, MCP) while staying a single
  module that is deleted in one go (Principle VI).
- **Alternatives**: Separate modules per binary (more `go.work` churn, no benefit); a web framework
  (Gin/Echo; the 1.22+ standard library routing is enough, and better for learning).

## R11. Auth for the owner and for tools

- **Decision**:
  - Owner sign-in: **Amazon Cognito user pool** (Lite tier, free under 10 k MAU) with managed login,
    authorization-code + PKCE in the SPA (`oidc-client-ts`), and TOTP MFA required.
  - The web app sends the access token in **`X-SuperLens-Token`**, not `Authorization`. With Lambda Function
    URL + OAC, CloudFront signs the origin request itself with SigV4 in the `Authorization` header, so the
    viewer's `Authorization` header can't be used.
  - Tools send **`X-Api-Key: sl_<id>_<secret>`**. Only an Argon2id hash of the secret is stored. The key is
    checked on **every** request (no authorizer cache), so revocation takes effect immediately (SC-001a).
  - **POST/PUT/DELETE through OAC to a Function URL require an `x-amz-content-sha256` header** holding the
    body's SHA-256. The web client computes it with `crypto.subtle`; the MCP/CLI computes it in Go.
- **Alternatives**: API Gateway JWT authorizer (supports only one auth type per route, and leaves a public
  endpoint); hand-rolled passwords or passkeys (more code and risk than Cognito).

## R12. Calculations and correctness across Go and TypeScript

- **Decision**: The browser computes chart series from chunks (fast redraws, SC-003). Go computes the same
  values for the data interface. Both are tested against **shared golden fixtures** in
  `contracts/superlens/fixtures/*.json` (inputs and expected outputs for compounding, drawdown, best/worst
  day and AUD conversion), at a tolerance of 1e-6. This is the seam test required by Principle III and the
  proof of SC-004.
- Formulas:
  - Option cumulative return over [a, b] = ∏(1 + rᵢ/100) − 1, over the business days after a, up to and
    including b.
  - Index cumulative change = Lb / La − 1.
  - AUD view of a foreign index level L on date d = L / fx(d), where fx = foreign units per 1 AUD (the
    rate on d, or the most recent earlier rate up to 5 days back).
  - Largest fall = min over t of (Vt / max₍s≤t₎ Vs − 1).
- **Alternatives**: Go compiled to WebAssembly and shared (heavy bundle, and harder to learn and debug).

## R13. Charting library

- **Decision**: **TradingView Lightweight Charts** (Apache-2.0, ~45 KB): built for financial time series,
  canvas rendering (handles 6,500 points × 10 lines easily), crosshair and touch support for phones, and a
  histogram series for the daily view. The data-source attribution and the library's required attribution
  are shown in the footer.
- **Alternatives**: uPlot (fastest, less polished on touch); ECharts (heavy); Recharts (SVG, slows down with
  25 years of daily data).

## R14. Scheduling and the update flow

- **Decision**: EventBridge Scheduler cron `0 7 * * ? *` in `Australia/Sydney` (handles daylight saving)
  invokes `superlens-update`. Manual Refresh: the API checks the lock and cooldown, then invokes the job
  asynchronously and returns `202` with a run id. The UI polls `GET /api/v1/runs/{id}`.
- Update algorithm per source:
  1. Take the lock (conditional put, 15-minute lease).
  2. `from = lastStoredDate − 5 business days` (or the backfill cursor). Fetch in windows no longer than
     the source's maximum range. Sources run in parallel; a failure in one doesn't stop the others.
  3. Validate the whole response; on any error discard it (FR-007).
  4. Merge into the year chunks: upsert by date, mark revised values, add new options.
  5. Write new hashed chunks, then **one** manifest PUT. Readers see either the old or the new manifest,
     never half of each.
  6. Record the run and release the lock. Invalidate `/data/v1/manifest.json` if public data changed.
  7. Clean up chunks not referenced by the manifest and older than 2 days.
- **Backfill**: walk backwards a year at a time from the earliest stored date until two consecutive windows
  return no data, saving a cursor after each window. Stop at a 10-minute budget; the next run resumes
  (FR-002).

## R15. AI opportunities (owner request)

| Item | In this feature? | What |
|---|---|---|
| **MCP server** (`superlens-mcp`) | **Yes** (supports FR-015a) | Tools `list_series`, `get_series_values`, `compare_performance` (period stats for several series, AUD or local), `get_update_status`, `request_refresh`. Resource `superlens://series/{id}`. Lets Claude Code / Claude Desktop analyse your data directly instead of you pasting CSVs. |
| **Claude skill** `superlens-analyst` | **Yes** | `.claude/skills/superlens-analyst/SKILL.md`: how to use the MCP tools, a standard morning-brief and "compare options over cycles" workflow, chart conventions, and the FR-017 rule (present data, never recommend). |
| **Scheduled AI morning brief** | Follow-up | A Claude routine (`/schedule`) at 7:30 that runs the skill and sends a summary. No infra cost; uses your Claude plan. |
| **RAG over fund documents** | Follow-up spec (004) | Index AustralianSuper option descriptions, asset allocations and PDS/annual reports so analysis can explain *why* options behave differently. Proposed: S3 Vectors + Bedrock Titan embeddings (cents a month), exposed as an extra MCP tool `search_fund_docs`. Left out of v1 to keep scope and cost tight. |
| Built-in "ask" assistant in the web app | No | Rejected in clarification (Q4 chose option B). |

## R16. Cost estimate (ap-southeast-2, monthly, normal use)

| Item | Estimate |
|---|---|
| CloudFront (free flat-rate plan, or the always-free tier) | $0.00 |
| S3 (≤ 50 MB, a few thousand requests) | ~$0.01 |
| DynamoDB on-demand (≤ 1 MB, a few thousand requests) | ~$0.00 (free tier) |
| Lambda (one daily job ~60 s at 512 MB plus owner API calls) | $0.00 (free tier) |
| EventBridge Scheduler (30 invocations) | $0.00 |
| Cognito Lite (1 MAU) | $0.00 |
| CloudWatch Logs (2-week retention, small) | ~$0.05 |
| CloudFront Function (owner traffic only reaches `/api/*`) | ~$0.00 |
| AWS Budgets (2 free) + Cost Anomaly Detection | $0.00 |
| **Total** | **≈ $0.10/month**; worst case under a flood is capped by R9 |

An optional custom domain adds Route 53 ($0.50/month hosted zone plus the domain fee). Not included.
