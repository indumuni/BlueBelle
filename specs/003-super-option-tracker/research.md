# Research: Super Investment Option Tracker (SuperLens)

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-11-12

Each section records a decision, why it was made, and what else was considered. Items marked
**VERIFY IN SPIKE** are assumptions that task T001 (data-source spike) must confirm before the
dependent code is written.

---

## R1. App name

- **Decision**: **SuperLens**. Apps `apps/superlens-go` and `apps/web-superlens`, each with its own infra
  project of the same name (R17); stacks `bb-superlens-go-<stage>` and `bb-web-superlens-<stage>`.
- **Rationale**: Short, fits the repo's `<name>-go` / `web-<name>` naming, and avoids using the provider's
  brand in the product name.
- **Alternatives**: AustralianSuperVisualizer (long, uses the brand), SuperPulse, OptionWatch. Renaming is
  a find-and-replace until the apps are scaffolded.

## R2. Overall shape: static-first, serverless, everything behind CloudFront

- **Decision**: Precompute data into **immutable JSON files in S3** and serve them through **CloudFront**.
  The backend distribution serves the data (`/data/*`) and the API (`/api/*`). The frontend
  distribution serves the React app and passes `/data/*` and `/api/*` through to the backend distribution,
  so the browser sees one origin (R17). Compute runs only for (a) the daily/manual update and (b) API calls.
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
  - **Metadata and state** (sources, series catalogue, watchlist, update runs, backfill cursor,
    update lock) → one **DynamoDB** table, on-demand billing.
- **Rationale**: Full history is tiny (≈40 series × 25 years × 260 days ≈ 260 k points, a few MB of JSON). A
  year chunk is ≤ 10 KB gzipped, so a 25-year chart is ~25 cached requests made in parallel. DynamoDB gives
  conditional writes for the lock, and on-demand pricing is effectively free at this size
  (well inside the always-free 25 GB).
- **Alternatives**:
  - All values in DynamoDB: needs Lambda on every read, so no cache-only read path.
  - SQLite or Parquet on S3: neat, but needs compute to query and is harder for the browser to read.
  - Aurora Serverless / RDS: minimum monthly cost; rejected.

## R5. Caching strategy

- **Decision**:
  - Chunks: `Cache-Control: public, max-age=31536000, immutable` (content hash in the name, so they never go
    stale).
  - Manifest `/data/v1/manifest.json`: `max-age=60, s-maxage=86400`. After every successful update
    the job writes a new manifest and **invalidates that one path** (the first 1,000 invalidation paths a
    month are free; we use ~31).
  - API GET responses: `public, max-age=60, s-maxage=300` (v1 has no per-user content, R18).
  - The CloudFront cache policy for `/data/*` **ignores all query strings, headers and cookies**, and error
    responses (403/404) are cached for 60 s.
  - The Go API keeps a small in-memory LRU of decoded chunks keyed by hash (safe because they're immutable).
- **Rationale**: Gives the owner's request for caching: after first load, charts need only one small
  manifest request per day. Ignoring query strings stops "cache-busting" floods from reaching S3.
- **Alternatives**: Fixed TTLs without content hashes (forces a choice between stale data and frequent
  misses); a separate cache service such as ElastiCache (always-on cost).

## R6. Public vs private data (spec FR-016 as amended) — **superseded for v1 by R18**

> v1 serves every series from `data/v1/` with no sign-in. `visibility` is still recorded per source so
> this split can be switched on before going public. The text below is the design for that switch.


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

1. **CloudFront in front of everything** (both distributions, R17). AWS Shield Standard (network-layer
   DDoS) is automatic and free. S3 and Lambda are reachable **only** through the backend distribution: S3 via Origin Access Control, Lambda via a **Function
   URL with `AuthType: AWS_IAM` + CloudFront OAC**. There is no public API Gateway endpoint to attack
   directly.
2. **CloudFront flat-rate "Free" plan** ($0/month; includes AWS WAF with managed rules, a rate-based rule
   and DDoS protection, with **no overage charges**: traffic beyond the allowance is degraded, not billed).
   **VERIFY IN SPIKE** that both distributions' features (Function URL + OAC origin, CloudFront Function,
   a CloudFront origin) are eligible, and that the account may hold two free plans. If not, use pay-as-you-go CloudFront, whose always-free tier (10 M requests and 1 TB a
   month) already covers normal use; skip paid WAF (~$6+/month) and rely on the layers below.
3. **Cache-only public path**: anonymous traffic hits only cached `/` and `/data/*` content; cache keys
   ignore query strings, headers and cookies; errors are cached.
4. ~~CloudFront Function pre-filter on `/api/*`~~: **dropped in v1** (R18). With no credentials there's
   nothing to pre-check. Restore it together with sign-in before going public.
5. **Lambda reserved concurrency**: API = 5, update job = 1. This caps the worst-case compute bill and also
   enforces one update at a time.
6. **Refresh cooldown**: a DynamoDB lock with a 15-minute lease, and refresh refused within 5 minutes of the
   last run (FR-018).
7. ~~Cognito sign-in~~: **dropped in v1** (R18). The CSV import is not exposed publicly at all; it needs the
   owner's AWS credentials (FR-016b).
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
    `github.com/modelcontextprotocol/go-sdk`. It calls the data interface (no credentials in v1). It also hosts
    the `import` subcommand from R7, which writes to S3 with the owner's AWS credentials.
  - Internal packages: `source` (adapter interface + `australiansuper`, `yahoo`, `frankfurter`),
    `series` (merge, delta, chunking, hashing), `calc` (compounding, drawdown, AUD conversion), `store`
    (S3 + DynamoDB), `api` (handlers). No `auth` package in v1 (R18).
- **Rationale**: Covers a broad slice of Go (HTTP servers, Lambda handlers, AWS SDK v2, concurrency for
  parallel fetches with `errgroup`, generics in the series code, code generation, MCP) while staying a single
  module that is deleted in one go (Principle VI).
- **Alternatives**: Separate modules per binary (more `go.work` churn, no benefit); a web framework
  (Gin/Echo; the 1.22+ standard library routing is enough, and better for learning).

## R11. Auth for the owner and for tools — **deferred; not in v1 (R18)**

> Kept as the ready-made design for "before going public". Only the last bullet (`x-amz-content-sha256`)
> applies in v1.


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
| **MCP server** (`superlens-mcp`) | **Yes** (supports FR-015a) | Tools `list_series`, `get_series_values`, `compare_performance` (period stats for several series, AUD or local), `get_update_status`, `request_refresh`. Resource `superlens://series/{id}`. Lets Claude Code / Claude Desktop analyse your data directly instead of you pasting CSVs. Needs only `SUPERLENS_URL` in v1. |
| **Claude skill** `superlens-analyst` | **Yes** | `.claude/skills/superlens-analyst/SKILL.md`: how to use the MCP tools, a standard morning-brief and "compare options over cycles" workflow, chart conventions, and the FR-017 rule (present data, never recommend). |
| **Scheduled AI morning brief** | Follow-up | A Claude routine (`/schedule`) at 7:30 that runs the skill and sends a summary. No infra cost; uses your Claude plan. |
| **RAG over fund documents** | Follow-up spec (004) | Index AustralianSuper option descriptions, asset allocations and PDS/annual reports so analysis can explain *why* options behave differently. Proposed: S3 Vectors + Bedrock Titan embeddings (cents a month), exposed as an extra MCP tool `search_fund_docs`. Left out of v1 to keep scope and cost tight. |
| Built-in "ask" assistant in the web app | No | Rejected in clarification (Q4 chose option B). |

## R16. Cost estimate (ap-southeast-2, monthly, normal use)

| Item | Estimate |
|---|---|
| CloudFront, 2 distributions (free flat-rate plans, or the always-free tier; proxied requests count at both) | $0.00 |
| S3 (≤ 50 MB, a few thousand requests) | ~$0.01 |
| DynamoDB on-demand (≤ 1 MB, a few thousand requests) | ~$0.00 (free tier) |
| Lambda (one daily job ~60 s at 512 MB plus owner API calls) | $0.00 (free tier) |
| EventBridge Scheduler (30 invocations) | $0.00 |
| CloudWatch Logs (2-week retention, small) | ~$0.05 |
| AWS Budgets (2 free) + Cost Anomaly Detection | $0.00 |
| **Total** | **≈ $0.10/month**; worst case under a flood is capped by R9 |

An optional custom domain adds Route 53 ($0.50/month hosted zone plus the domain fee). Not included.

## R17. Two infrastructure projects: backend and frontend (owner decision, 2026-11-13)

- **Decision**: One infra project per app, as the scaffolders create them:

  | Project | Stack | Owns |
  |---|---|---|
  | `infra/projects/superlens-go` (backend) | `bb-superlens-go-<stage>` | Data bucket, DynamoDB table, API Lambda (Function URL + OAC), update Lambda, EventBridge schedule, **backend CloudFront distribution** (`/data/*` → S3, `/api/*` → Lambda), budget and anomaly monitor |
  | `infra/projects/web-superlens` (frontend) | `bb-web-superlens-<stage>` | Site bucket and **frontend CloudFront distribution**: SPA at `/*`; `/data/*` and `/api/*` proxied to the backend distribution's domain as an HTTPS origin |

- **How they connect without stack references** (constitution: projects never reference each other's
  stacks):
  - The frontend needs the **backend domain**. It is read from the env var `SUPERLENS_BACKEND_DOMAIN` at
    synth or deploy (e.g. `SUPERLENS_BACKEND_DOMAIN=d111.cloudfront.net just infra-deploy web-superlens`).
    Without it, synth uses the placeholder `backend.invalid` and adds a CDK warning, so CI synth still works.
  - The backend needs nothing from the frontend in v1 (no sign-in, so no Cognito callback URL; R18). The web
    build contains no backend values.
  - You may keep the value in a gitignored `infra/.env.<stage>` and `source` it before deploying.
- **Deploy order** (first time per stage): backend → frontend with `SUPERLENS_BACKEND_DOMAIN`. After that,
  each project deploys and destroys independently. (Adding sign-in later brings back `SUPERLENS_WEB_ORIGIN`
  and a third step, R11.) If the backend
  is destroyed, the frontend still serves the app but `/data` and `/api` return errors.
- **Why proxy instead of calling the backend cross-origin**: the browser stays same-origin. The custom
  header `x-amz-content-sha256` (and, later, auth headers) would otherwise trigger a CORS pre-flight before
  every API call, and the contract's paths stay exactly as designed.
- **Caching across the two layers**:
  - Frontend `/data/*` uses the origin's cache headers, so immutable chunks are cached at both
    distributions.
  - Frontend `/data/v1/manifest.json` has its own cache policy with a **maximum TTL of 60 s**. The update
    job only invalidates the backend distribution, and the frontend picks up a new manifest within a minute.
    The backend never needs to know the frontend's distribution id, so there's no reverse dependency.
  - Frontend `/api/*`: caching disabled; forwards all viewer headers, query strings and cookies **except
    `Host`**.
- **Protection**: as R9 for the backend. The frontend forwards `/api/*` unchanged. Tools (MCP, scripts) call
  the backend domain directly.
- **`infra/common` change**: `StaticSite` gains an optional `proxies: { pathPattern, domainName,
  cachePolicy? }[]` that adds extra behaviours to an HTTPS origin, with tests. It's reusable for any site
  that fronts an API.
- **Alternatives**:
  - One infra project with one distribution (the previous plan). Simplest at runtime, but it broke the
    one-infra-project-per-app rule. Dropped at the owner's request.
  - Frontend calls the backend directly with CORS. Adds a pre-flight per API call and still needs the web
    origin on the backend.
  - Frontend reads backend values from SSM at deploy time. Automatic, but it's a cross-project dependency,
    which the constitution forbids today (only `shared` may be read through SSM). It would need a MINOR
    amendment.
  - **Common stack that owns one CloudFront distribution for both apps** (reviewed 2026-11-13). Rejected:
    the distribution needs both projects' origins, while each origin's access rule (S3 bucket policy for
    OAC, Lambda Function URL permission) must name the distribution. That's a circular dependency across
    three projects, so none of them could be deployed or destroyed alone.
  - **Frontend consuming the backend stack's outputs** (CloudFormation exports / `Fn::ImportValue`).
    Rejected: forbidden by the constitution for projects. It also locks the backend, which can't change or
    remove an exported value while the frontend imports it.
  - **Custom domain in `infra/shared`** (Route 53 hosted zone + ACM certificate in `us-east-1`, read through
    SSM). Both names are then fixed (`superlens.<domain>` and `api.superlens.<domain>`), so the env vars and
    the three-step first deploy go away. This is the cleanest option, but it costs ~$0.50/month plus the
    domain. **Owner decision (2026-11-13): no domain for now; keep the env-var settings.** Upgrade path:
    add the zone and certificate to `shared`, then derive both names from it in each project's `bin/app.ts`,
    replacing `SUPERLENS_BACKEND_DOMAIN`. Nothing else in the design changes.

## R18. No authentication in v1 (owner decision, 2026-11-13)

- **Decision**: v1 is for personal use at an unadvertised address, so it has **no sign-in and no access
  keys**. Every screen, series, the watchlist, Refresh and the data interface are open to anyone with the
  address. This supersedes R6 (enforcement), R11 and parts of R9 for v1.
- **What stays protected, at no cost**:
  - **Stored data can't be changed through the address.** The only public write paths are Refresh (which
    re-fetches from the real sources) and the watchlist/preferences. The CSV import fallback (R7) is not an
    endpoint: `superlens-mcp import` uploads to `s3://…/imports/` with the owner's AWS credentials, and the
    S3 event starts the update job (FR-016b).
  - **Refresh can't be abused.** It is lock- and cooldown-limited (≤ 1 run per 5 minutes, R14), and the update
    job has reserved concurrency 1.
  - **The bill is capped**: CloudFront caching, Function URL + OAC origin lockdown, API reserved concurrency 5,
    and the budget alarm (R9 items 1–3, 5, 6, 8).
  - **API GET responses are cacheable now.** They have no per-user content, so `/api/v1/series`, `/values`,
    `/performance`, `/sources` and `/runs` send `Cache-Control: public, max-age=60, s-maxage=300`. The
    `/api/*` GET cache key includes the query string. Writes are never cached.
- **Accepted risks for v1**:
  - Anyone who learns the address can see all data, including index data whose source forbids republishing.
  - They could edit the watchlist and preferences (annoying, not harmful; data is unaffected).
  - They could press Refresh (rate-limited).
- **Removed from the design**:
  - Cognito user pool, `oidc-client-ts`, the Go `auth` package (`golang-jwt`, `keyfunc`, `argon2`).
  - Access keys (entity, endpoints and UI), the `private/` S3 prefix and private manifest, the private-chunk
    endpoint.
  - `/api/v1/me`, `/api/v1/config`, the import endpoint, the edge pre-filter, `SUPERLENS_WEB_ORIGIN`.
- **Kept, so going public is a bounded change**:
  - `visibility` on every source and series.
  - The R6 and R11 designs written up above.
  - Same-origin proxying (R17), so auth headers can be added later without CORS work.
- **Before going public (checklist)**:
  1. Owner sign-in (R11: Cognito + MFA) on the watchlist, preferences and Refresh; access keys for tools.
  2. For `visibility: private` sources: serve them only to the signed-in owner (R6), or replace them with
     licensed data.
  3. Re-check every source's terms (R7, R8).
  4. Restore the `/api/*` edge pre-filter and make API caching per-user where needed.
- **Alternatives**:
  - Keep full auth now (more work and moving parts for a personal tool).
  - A single shared-secret header on write endpoints only (cheap middle ground; not chosen, the owner
    accepts the watchlist risk).
