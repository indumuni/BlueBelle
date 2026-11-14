---
description: "Task list for SuperLens (003-super-option-tracker)"
---

# Tasks: Super Investment Option Tracker (SuperLens)

**Input**: Design documents from `specs/003-super-option-tracker/`: [plan.md](./plan.md), [spec.md](./spec.md),
[research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/),
[quickstart.md](./quickstart.md), [testdata/](./testdata/README.md)

**Tests**: Included. Constitution Principle IV ("Tests Prove It") and plan.md (Testing) require automated
tests for every story, plus the shared golden fixtures (SC-004).

**Organization**: Grouped by user story (spec.md US1–US5), then the data interface/AI phase and hardening,
following plan.md "Delivery order".

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US5 (spec.md); setup, foundational, data-interface and polish tasks have no story label

## Path conventions (monorepo, plan.md "Project Structure")

- Go module: `apps/superlens-go/` (module path `bluebelle/apps/superlens-go`)
- Web app: `apps/web-superlens/`
- Backend infra: `infra/projects/superlens-go/`; frontend infra: `infra/projects/web-superlens/`
- Shared constructs: `infra/common/`; contract: `contracts/superlens.openapi.yaml`;
  fixtures: `contracts/superlens/fixtures/`

## Ground rules for every task

- Run `just lint test` before marking a phase done (CLAUDE.md).
- **Never** run `just cdk-bootstrap`, `just infra-deploy`, `just infra-destroy` or raw `cdk deploy/destroy`
  without the owner's explicit approval. Tasks that need a deploy say "OWNER APPROVAL".
- Never bypass the provider's bot protection: no browser-impersonating headers, no header rotation, no
  headless browsers (research R7). Identify as `User-Agent: SuperLens/1.0 (personal use)`.
- Present data only; never phrase output as a buy/sell/switch recommendation (FR-017).
- No AI attribution in commits.

---

## Phase 1: Setup (spike + scaffolding)

**Purpose**: Settle the open data-source questions, then create both apps and both infra projects.

- [ ] T001 Data-source spike (time-box 1 day). Write findings in `specs/003-super-option-tracker/spike.md` and recorded responses in `apps/superlens-go/testdata/` (after T002, or a temporary folder before). Check:
  (a) AustralianSuper CSV `https://www.australiansuper.com/api/graphs/dailyrates/download/?start=dd/mm/yyyy&end=dd/mm/yyyy&cumulative=False&superType=super&truncateDecimalPlaces=True&outputFilename=x.csv` with `User-Agent: SuperLens/1.0 (personal use)` from the owner's laptop **and** from a throwaway Lambda in `ap-southeast-2` (OWNER APPROVAL to create it). Record status codes. If either gets 403, stop; do not retry with other headers.
  (b) Format is **already verified** from the owner's sample `testdata/australian-super/Daily.csv` (research R7: CR line endings, `Rate Date` + 10 options, ISO dates, all-zero rows on non-business days). Still record: earliest available date, longest range allowed per request, roughly when each day's rate appears, and whether a public holiday (e.g. 25–26 Dec) is also an all-zero row. If the owner downloads a full calendar year in the browser, save it unmodified as `apps/superlens-go/testdata/australiansuper/<year>.csv`.
  (c) Read the AustralianSuper website terms on automated access and republishing.
  (d) Yahoo chart endpoint for `^AORD`, `^GSPC`, `^FTSE`, `EEM` (`https://query1.finance.yahoo.com/v8/finance/chart/<symbol>?period1=…&period2=…&interval=1d`): save one response each as `testdata/yahoo/<symbol>.json`, plus earliest date.
  (e) Frankfurter `https://api.frankfurter.dev/v1/1999-01-04..2000-01-04?base=AUD&symbols=USD,GBP`: save as `testdata/frankfurter/range.json`.
  (f) CloudFront: can one account hold two free flat-rate plans, and are a Function URL + OAC origin and a CloudFront-domain origin eligible (R9, R17)?
  **Decision output**: `australiansuper` source `mode` = `fetch` or `import` (R7), recorded at the top of `spike.md`.
- [ ] T002 Scaffold the backend app and infra: `just new-go superlens` (creates `apps/superlens-go`, `infra/projects/superlens-go`, adds `./apps/superlens-go` to `go.work`). Rename nothing; the server main is `apps/superlens-go/cmd/superlens/main.go`.
- [ ] T003 [P] Scaffold the frontend app and infra: `just new-web superlens` (creates `apps/web-superlens`, `infra/projects/web-superlens`).
- [ ] T004 Move `specs/003-super-option-tracker/testdata/australian-super/Daily.csv` to `apps/superlens-go/testdata/australiansuper/Daily.csv` with `git mv` (byte-for-byte; CR line endings must survive, so add `apps/superlens-go/testdata/**/*.csv -text` to `.gitattributes`), and the other examples to `apps/superlens-go/testdata/examples/` (keep `README.md`; fix its relative links) and leave a one-line pointer `testdata/README.md` in the spec folder.
- [ ] T005 [P] Add `infra/.env.*` to `.gitignore` (local `SUPERLENS_BACKEND_DOMAIN` settings, research R17).
- [ ] T006 Add Go dependencies in `apps/superlens-go/go.mod`: `github.com/aws/aws-sdk-go-v2` (config, service/s3, service/dynamodb, service/lambda, service/cloudfront, feature/dynamodb/attributevalue), `github.com/aws/aws-lambda-go`, `golang.org/x/sync`, `github.com/oklog/ulid/v2`, `github.com/modelcontextprotocol/go-sdk`, and `github.com/oapi-codegen/oapi-codegen/v2` + `github.com/oapi-codegen/runtime` (tool dependency via `go get -tool`). Run `go mod tidy`.
- [ ] T007 [P] Add web dependencies in `apps/web-superlens/package.json`: `lightweight-charts` (dependency), `openapi-typescript` (devDependency); add script `"gen:api": "openapi-typescript ../../contracts/superlens.openapi.yaml -o src/api/schema.d.ts"` and run it from `"prebuild"` and `"pretest"`.

**Checkpoint**: `just lint test build` passes with both scaffolds; spike decision recorded.

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: Contract, generated code, core Go packages, golden fixtures and `infra/common` changes that
every story uses.

**⚠️ CRITICAL**: No user story work starts until this phase is complete.

### Contract and code generation

  - [ ] T008 Promote the contract: copy `specs/003-super-option-tracker/contracts/superlens.openapi.yaml` to `contracts/superlens.openapi.yaml` (canonical from now on), delete the spec copy, and point links in `plan.md`, `quickstart.md` and `contracts/mcp-tools.md` at the new path. Update the `Chunk`/`Manifest` schemas if the spike (T001) changed any field.
- [ ] T009 Generate the Go server and types: add `apps/superlens-go/internal/apigen/gen.go` with `//go:generate go tool oapi-codegen -config cfg.yaml ../../../../contracts/superlens.openapi.yaml` and `cfg.yaml` (`package: apigen`, `generate: { std-http-server: true, strict-server: true, models: true }`, `output: apigen.gen.go`). Commit the generated file. Make `just build-go` run `go generate ./...` first (edit `justfile` recipe `build-go`).
- [ ] T010 [P] Generate web types: run `pnpm gen:api` in `apps/web-superlens` to produce `src/api/schema.d.ts` (committed); add `src/api/client.ts` with a typed `fetchJson<T>(path)` and a `send(method, path, body?)` that sets `content-type: application/json` and `x-amz-content-sha256` = hex SHA-256 of the body (empty-string hash for no body) computed with `crypto.subtle` (research R11, required for writes through OAC to a Function URL).

### Go core packages

- [ ] T011 [P] Domain types in `apps/superlens-go/internal/series/types.go`: `SourceID`, `SeriesID` (validate `^[a-z][a-z0-9-]{1,30}$` and `<sourceId>.<slug>` with slug `^[a-z0-9-]{1,60}$`), `Date` (ISO `YYYY-MM-DD`, market's own trading date), `Point{Date, Value float64, RevisedAt *time.Time}`, `Kind` (`option|index|fx|other`), `ValueType` (`return_pct|level`), `Visibility` (`public|private`), `Status` (`active|discontinued`), `DataSource` and `Series` structs with every field in data-model.md. Table-driven tests for id validation in `types_test.go`.
- [ ] T012 [P] Chunking and hashing in `apps/superlens-go/internal/series/chunk.go`: split points by calendar year; canonical JSON body `{"seriesId","year","points":[[date,value],[date,value,revisedAt]…]}` sorted by date, values formatted with at most 6 decimals; `hash12` = first 12 hex chars of SHA-256 of the body; key `data/v1/series/<seriesId>/<year>.<hash12>.json`. Test that the same input gives byte-identical output (FR-004) in `chunk_test.go`.
- [ ] T013 [P] Merge/delta in `apps/superlens-go/internal/series/merge.go`: `Merge(existing, fetched []Point, now time.Time) (merged []Point, added, revised int)`; upsert by date (never duplicate, FR-004), set `RevisedAt` only when the value differs (FR-005). Tests in `merge_test.go`: new days, identical re-fetch (0 added/0 revised), revised value, out-of-order input.
- [ ] T014 [P] Business-day logic in `apps/superlens-go/internal/series/bizdays.go`: learn the calendar from stored dates (spec Assumptions: no holiday list); `RecheckFrom(points, n=5) Date` returns the date 5 stored business days before the last stored date; `IsDiscontinued(lastDate, sourceLastDate, 10)` compares against the source's latest business days. Tests in `bizdays_test.go`.
- [ ] T015 [P] Validation in `apps/superlens-go/internal/series/validate.go` (data-model.md "Validation rules"): reject the whole response on any parse error, unknown date format or non-numeric value; reject if the column set shrinks by more than half versus the known series; reject dates after "today" in the market's time zone; reject option daily returns outside ±25% ("implausible", reported, not stored). Tests in `validate_test.go`.
- [ ] T016 Store interface in `apps/superlens-go/internal/store/store.go`: `Blobs` (Get/Put/List/Delete objects with content type, encoding and cache-control) and `Meta` (sources, series, watchlist, prefs, runs, lock) interfaces, plus a `memory` implementation in `store/memory.go` and a `file://` implementation in `store/file.go` (directory tree mirroring S3 keys, JSON files for items) used by `SUPERLENS_STORE=file://./.localdata`. Tests in `store/memory_test.go` and `store/file_test.go`.
- [ ] T017 S3 + DynamoDB implementation in `apps/superlens-go/internal/store/aws.go`: bucket from env `SUPERLENS_BUCKET`, table from `SUPERLENS_TABLE`. Single-table keys exactly as data-model.md: DataSource `PK=SOURCE#<id>, SK=META`; Series `PK=SOURCE#<sourceId>, SK=SERIES#<seriesId>`; WatchlistEntry `PK=OWNER, SK=WATCH#<seriesId>`; Preferences `PK=OWNER, SK=PREFS`; UpdateRun `PK=RUNS, SK=RUN#<runId>` with `expiresAt` = now + 400 days; UpdateLock `PK=LOCK, SK=UPDATE`. Chunks are written gzip-compressed with `Content-Type: application/json`, `Content-Encoding: gzip`, `Cache-Control: public, max-age=31536000, immutable`. `store.Open(url)` picks `memory://`, `file://` or `aws://`. Unit-test key mapping with a fake DynamoDB client in `store/aws_test.go`.
- [ ] T018 Source adapter interface in `apps/superlens-go/internal/source/source.go`: `type Adapter interface { Source() series.DataSource; Fetch(ctx, from, to series.Date) (Result, error) }` where `Result` is `map[SeriesID]SeriesMeta + []Point`; a registry `source.All(cfg)`; HTTP client with 20 s timeout and `User-Agent: SuperLens/1.0 (personal use)`; window splitting helper `Windows(from, to, maxRangeDays)`. Fault injection: if env `SUPERLENS_FAULT` names the source id, `Fetch` returns an error (quickstart V4).

### Calculations (shared seam)

- [ ] T019 Golden fixtures in `contracts/superlens/fixtures/*.json`, shape per [contracts/fixtures.md](./contracts/fixtures.md), one file per required case: `01-compounding-basic.json` (+1%, −0.5%, +0.25% → 0.7462375), `02-range-starts-weekend.json`, `03-series-starts-inside-range.json`, `04-drawdown-recovery.json`, `05-fx-fill-and-gap.json` (fill from previous rate; a gap > 5 days listed in `gaps`), `06-different-calendars.json`, `08-currency-effect.json` (USD index +10% while AUD/USD 0.70 → 0.65 gives +18.4615385% in AUD). Case 07 (a full year of real data) is added in T020 when the spike CSV exists.
- [ ] T020 [P] Add fixture `contracts/superlens/fixtures/07-real-sample.json` (`operation: period_stats`) from `Daily.csv`: inputs are the 8 business-day rows (all-zero rows already dropped) for each series in the table in [contracts/fixtures.md](./contracts/fixtures.md) case 7, expected values exactly as listed there (e.g. High Growth totalReturnPct 2.1118394, maxDrawdownPct −0.2572738). If the spike records a full calendar year, add `07b-real-year.json` checked against a spreadsheet.
- [ ] T021 [P] Go calc in `apps/superlens-go/internal/calc/calc.go` (research R12 formulas): `CumulativeReturn(valueType, points, from, to)` — options ∏(1 + rᵢ/100) − 1 over business days after the baseline up to `to`, baseline = last point on or before `from`; levels Lb/La − 1; `PeriodStats` (totalReturnPct, bestDay, worstDay, maxDrawdownPct = min over t of (Vt / max₍s≤t₎ Vs − 1)); `AUDConvert(levels, fx)` = L / fx(d) with fx on d or the most recent earlier rate up to 5 days back, otherwise the date goes to `gaps`; `Rebase(valueType, points, base)`. Test `calc_test.go` loads every file in `contracts/superlens/fixtures/` and checks within `tolerance`.
- [ ] T022 [P] TS calc in `apps/web-superlens/src/lib/calc.ts` with the same four functions and identical rules; `src/lib/calc.test.ts` loads every fixture via `import.meta.glob("../../../../contracts/superlens/fixtures/*.json", { eager: true })` and checks within `tolerance`.

### infra/common changes

- [ ] T023 [P] `HttpLambda` in `infra/common/src/http-lambda.ts`: add `frontDoor?: "httpApi" | "functionUrl"` (default `"httpApi"`, existing behaviour unchanged) and `reservedConcurrency?: number`. For `"functionUrl"` create `fn.addFunctionUrl({ authType: FunctionUrlAuthType.AWS_IAM })`, expose `readonly functionUrl?: lambda.FunctionUrl`, make `api` optional (`api?: apigw.HttpApi`), skip the HTTP API, and output the function URL. Update `infra/common/test/http-lambda.test.ts`: default still creates an HTTP API; `functionUrl` creates `AWS::Lambda::Url` with `AuthType: AWS_IAM` and no HTTP API; reserved concurrency is set.
- [ ] T024 [P] `StaticSite` in `infra/common/src/static-site.ts`: add `proxies?: { pathPattern: string; domainName: string; cachePolicy?: cloudfront.ICachePolicy; originRequestPolicy?: cloudfront.IOriginRequestPolicy; allowedMethods?: cloudfront.AllowedMethods }[]` that add `additionalBehaviors` with an `HttpOrigin(domainName, { protocolPolicy: HTTPS_ONLY })`. Defaults: `CachePolicy.CACHING_DISABLED`, `OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER`, `AllowedMethods.ALLOW_ALL`. **When proxies are present, don't use distribution-wide `errorResponses` for the SPA fallback** (they would turn proxied API 403/404s into `index.html`); instead attach a CloudFront Function (viewer-request) on the default behaviour that rewrites extension-less paths to `/index.html`. Tests in `infra/common/test/static-site.test.ts`: proxy behaviour exists with the right origin and policies; no `CustomErrorResponses` when proxies are set; existing SPA behaviour unchanged without proxies.
- [ ] T025 [P] Document both options and the two-project pattern (backend distribution + frontend proxy, `SUPERLENS_BACKEND_DOMAIN`, deploy order) in `infra/README.md`.

**Checkpoint**: `just lint test build` passes; Go and TS both pass every golden fixture; `infra/common` tests pass.

---

## Phase 3: User Story 1 — Keep a local history of daily option rates (P1) 🎯 MVP part 1

**Goal**: The update job keeps a complete history of AustralianSuper daily rates, fetching only missing days
plus the 5-day re-check, at 07:00 Sydney and on Refresh, with resumable backfill and a visible run history.

**Independent Test**: quickstart V1–V5 and V12. Locally: empty `file://` store → run `superlens-update` →
run again → second run's `perSource[].from` is ≥ 5 business days before the previous `lastDate`, and stored
values equal the recorded CSV.

### Tests for User Story 1

- [ ] T026 [P] [US1] AustralianSuper adapter test in `apps/superlens-go/internal/source/australiansuper/adapter_test.go` using `testdata/australiansuper/Daily.csv` (served by `httptest.Server`): CR-only line endings parse (also `\n` and `\r\n` variants generated in the test); exactly 10 series with ids `australiansuper.high-growth`, `.balanced`, `.socially-aware`, `.indexed-diversified`, `.conservative-balanced`, `.stable`, `.australian-shares`, `.international-shares`, `.diversified-fixed-interest`, `.cash`; ISO `Rate Date` values; 8 points per series (2026-11-01, -07, -08 all-zero rows skipped); High Growth 2026-11-05 = −0.2467; a row with some but not all zeros is kept; a `dd/mm/yyyy` date or missing `Rate Date` header rejects the file; a malformed file (truncated, non-numeric, missing half the columns) returns an error and no points.
- [ ] T027 [P] [US1] Update orchestration tests in `apps/superlens-go/internal/update/update_test.go` with the memory store and a fake adapter: initial backfill walks back a year per window until two consecutive empty windows, saving `backfill.cursor` after each and marking `complete`; a 10-minute budget (injected clock) stops and resumes from the cursor; a routine update requests `from = RecheckFrom(...)`; already-current data → status `succeeded`, `daysAdded = 0`; one source failing → run `partial`, other sources stored, failed source data unchanged and `lastError` set (FR-007); same response twice → no new chunk objects (FR-004); an option absent 10 business days → `discontinued`; it reappears → `active`.
- [ ] T028 [P] [US1] Lock tests in `apps/superlens-go/internal/update/lock_test.go`: acquire when free; refuse while the 15-minute lease is active (`ErrRunning`); acquire after lease expiry; refuse within 5 minutes of `lastFinishedAt` (`ErrCooldown` with retry-after seconds).
- [ ] T029 [P] [US1] API handler tests in `apps/superlens-go/internal/api/refresh_test.go` and `sources_test.go` (`httptest`, memory store, fake invoker): `POST /api/v1/refresh` → 202 `{runId}`, 409 while running, 429 within cooldown with `Retry-After`; `GET /api/v1/sources`, `GET /api/v1/runs?limit=`, `GET /api/v1/runs/{runId}` (404 unknown) match contract shapes; GETs send `Cache-Control: public, max-age=60, s-maxage=300`; `POST /api/v1/refresh` sends `Cache-Control: no-store`.
- [ ] T030 [P] [US1] Backend stack test in `infra/projects/superlens-go/test/stack.test.ts`: data bucket blocks public access and has an `imports/` → update Lambda notification and a 30-day lifecycle rule on `imports/`; table has `PK`/`SK`, on-demand billing, TTL `expiresAt`, `RemovalPolicy.DESTROY`; update Lambda reserved concurrency 1 and API Lambda 5; API Function URL `AuthType: AWS_IAM` with an OAC origin; scheduler `ScheduleExpression: cron(0 7 * * ? *)`, `ScheduleExpressionTimezone: Australia/Sydney`; distribution behaviours `/data/*` (S3 OAC, cache policy ignoring query strings, headers and cookies) and `/api/*` (Function URL origin); no bucket policy statement allows `s3:PutObject` to anything but the update role.

### Implementation for User Story 1

- [ ] T031 [US1] AustralianSuper adapter in `apps/superlens-go/internal/source/australiansuper/adapter.go`: source `{id: "australiansuper", name: "AustralianSuper daily rates", visibility: "public", attribution: "Daily rates: AustralianSuper", mode: <from T001>, maxRangeDays: <from T001>, recheckBusinessDays: 5}`; series ids `australiansuper.<slug of option name>` with `providerKey` = column name, `kind: option`, `valueType: return_pct`, `market: AU`, `currency: AUD`. `Fetch` requests the CSV URL (query dates `dd/mm/yyyy`) in windows; `ParseCSV(io.Reader)` is exported for the import path: normalise `\r\n`/`\r` to `\n` before `encoding/csv`, require header `Rate Date`, parse dates as ISO `2006-01-02`, skip rows where every option value is exactly 0 (non-publishing day, research R7), slugify column names (lowercase, non-alphanumerics → `-`). If `mode == import`, `Fetch` returns no data without calling the provider.
- [ ] T032 [US1] Lock in `apps/superlens-go/internal/update/lock.go`: conditional put on `LOCK/UPDATE` (`attribute_not_exists(PK) OR leaseUntil < :now`), lease 15 min, `Release` sets `lastFinishedAt`; cooldown 5 min (FR-008, FR-018).
- [ ] T033 [US1] Run orchestration in `apps/superlens-go/internal/update/update.go` (research R14): take lock → create `RUN#<ulid>` with `trigger` (`schedule|manual|import`), `status: running` → per source in parallel (`errgroup`, failures isolated): compute `from` (backfill cursor or `RecheckFrom`), fetch windows, validate whole response, merge into year chunks, add new series → write changed chunks → **one** manifest PUT `data/v1/manifest.json` (`Cache-Control: public, max-age=60, s-maxage=86400`; body `{generatedAt, sources, series[+chunks{year:url}]}`) → update source `lastSuccessAt`/`lastAttemptAt`/`lastError`/`backfill` and series `firstDate`/`lastDate`/`status` → finish run (`succeeded|partial|failed`, `perSource[{sourceId, from, to, daysAdded, daysRevised, newSeries, error?}]`) → release lock → invalidate `/data/v1/manifest.json` on the backend distribution (env `SUPERLENS_DISTRIBUTION_ID`, skipped when unset) if anything changed → delete chunk objects not referenced by the manifest and older than 2 days.
- [ ] T034 [US1] Import processing in `apps/superlens-go/internal/update/import.go`: for an S3 event on `imports/<sourceId>/<timestamp>.csv`, read the file, parse with the source's parser (`australiansuper.ParseCSV`), and run the same validate/merge/manifest path with `trigger = import`.
- [ ] T035 [US1] Update Lambda entry point in `apps/superlens-go/cmd/superlens-update/main.go` (`aws-lambda-go`): handles EventBridge Scheduler events (`trigger = schedule`), the API's async invoke payload `{"trigger":"manual","runId":"…"}`, and S3 `ObjectCreated` events (import). Local mode: when not on Lambda, flags `-since YYYY-MM-DD` and `-store file://…` run one update and exit (quickstart §1).
- [ ] T036 [US1] API handlers in `apps/superlens-go/internal/api/` implementing the generated strict server for `requestRefresh` (`refresh.go`: check lock/cooldown, pre-create the run id, async-invoke the update Lambda named in env `SUPERLENS_UPDATE_FUNCTION`, return 202), `listSources` (`sources.go`), `listRuns` and `getRun` (`runs.go`). Errors use the contract's `Error {code, message}`. Cache headers as in T029. Add a `/health` route for the Lambda Web Adapter readiness check.
- [ ] T037 [US1] Wire the API server in `apps/superlens-go/cmd/superlens/main.go`: `store.Open(env SUPERLENS_STORE, default aws://)`, `net/http` mux with the generated handler under `/api/v1/`, listen on `PORT` (default 8080). Locally with `file://`, also serve `/data/*` from the store directory so the web dev server can proxy it.
- [ ] T038 [US1] Backend stack in `infra/projects/superlens-go/lib/stack.ts` (replacing the template's `HttpLambda`): data bucket `bb-superlens-go-<stage>-data` (block public access, SSL, `autoDeleteObjects`, `RemovalPolicy.DESTROY`, lifecycle: expire `imports/` after 30 days); DynamoDB table `bb-superlens-go-<stage>` (`PK`/`SK` strings, PAY_PER_REQUEST, TTL `expiresAt`, DESTROY); update Lambda (`provided.al2023`, arm64, handler `bootstrap`, code `goWebCode(appDir, "./cmd/superlens-update")`, 512 MB, 15 min timeout, reserved concurrency 1, env `SUPERLENS_STORE=aws://`, `SUPERLENS_BUCKET`, `SUPERLENS_TABLE`, `SUPERLENS_DISTRIBUTION_ID`; read/write bucket and table; `cloudfront:CreateInvalidation` on the distribution); S3 `OBJECT_CREATED` notification for prefix `imports/` → update Lambda; API `HttpLambda` (`frontDoor: "functionUrl"`, `reservedConcurrency: 5`, `readinessPath: "/health"`, env as above plus `SUPERLENS_UPDATE_FUNCTION`; read bucket, read/write table, `lambda:InvokeFunction` on the update Lambda); backend `cloudfront.Distribution` with default/`/data/*` → `S3BucketOrigin.withOriginAccessControl` (cache policy: no query strings, headers or cookies; error caching 60 s) and `/api/*` → `FunctionUrlOrigin.withOriginAccessControl(apiFunctionUrl)` (allowed methods ALL; GET cache policy keyed on query string with TTLs honouring origin headers; origin request policy `ALL_VIEWER_EXCEPT_HOST_HEADER`); EventBridge Scheduler `CfnSchedule` `cron(0 7 * * ? *)` in `Australia/Sydney` → update Lambda with payload `{"trigger":"schedule"}`; `CfnOutput` `BackendDomain` (distribution domain) and `DataBucket`.
- [ ] T039 [US1] Seed the `australiansuper` DataSource item on first run if missing (in `update.go`, from the adapter's `Source()`), so a fresh deploy needs no manual data setup.

**Checkpoint**: `just test-go` and backend CDK tests pass; a local `file://` run builds full history from
the recorded CSV and a second run only re-checks the last 5 business days.

---

## Phase 4: User Story 2 — Chart and compare my investment options (P1) 🎯 MVP part 2

**Goal**: A phone-friendly web app that charts selected options as cumulative return from a common baseline
or as daily returns, with presets, hover values and stats, using only stored data.

**Independent Test**: quickstart V6. Pick two options over 1Y; `totalReturnPct` matches a spreadsheet from the
provider CSV within 0.01 pp; changing period redraws in < 2 s with no requests other than new chunks.

### Tests for User Story 2

- [ ] T040 [P] [US2] Data loader tests in `apps/web-superlens/src/data/loader.test.ts`: fetches `/data/v1/manifest.json` once, fetches only the year chunks covering the requested range, in parallel, and never refetches a chunk URL already loaded in the session.
- [ ] T041 [P] [US2] Period tests in `apps/web-superlens/src/lib/periods.test.ts`: presets 1W, 1M, 3M, 6M, FYTD (Australian financial year starts 1 July), 1Y, 3Y, All, and custom ranges resolve to `{from, to}` relative to the latest stored date.
- [ ] T042 [P] [US2] Component tests with Testing Library in `apps/web-superlens/src/pages/ChartPage.test.tsx` (mock `lightweight-charts`): selecting two options and a preset renders two lines and a `StatsTable` with total return, best day, worst day and largest fall per option; switching to "Daily" renders histograms; a series starting inside the range shows the "data from <date>" note; the footer shows attributions and "Data and calculations only; not financial advice." (FR-017).
- [ ] T043 [P] [US2] Frontend stack test in `infra/projects/web-superlens/test/stack.test.ts`: behaviours `/data/*` and `/api/*` target an HTTPS custom origin with the domain from `SUPERLENS_BACKEND_DOMAIN`; `/data/v1/manifest.json` behaviour has a cache policy with `MaxTTL` ≤ 60; the `/api/*` origin request policy doesn't forward `Host`; without the env var the stack synthesizes with `backend.invalid` and an annotation warning.

### Implementation for User Story 2

- [ ] T044 [P] [US2] Periods in `apps/web-superlens/src/lib/periods.ts` (presets from spec US2.4; FYTD from 1 July).
- [ ] T045 [P] [US2] Data loader in `apps/web-superlens/src/data/loader.ts`: `loadManifest()` (relies on the browser HTTP cache; no custom storage), `loadSeries(seriesId, from, to)` fetching the needed year chunks with `Promise.all`, decoding `[date, value, revisedAt?]` tuples, memoised by chunk URL.
- [ ] T046 [P] [US2] `Chart` component in `apps/web-superlens/src/components/Chart.tsx` on Lightweight Charts: line series per selected series from `calc.rebase` (cumulative %) or histogram series for daily view; crosshair tooltip with date and each series' value (FR-010); each line uses only its own dates (no forward fill, US3.2); resizes to the container (phone width, FR-016a); library attribution in the footer (R13).
- [ ] T047 [P] [US2] `PeriodPicker` (`src/components/PeriodPicker.tsx`), `SeriesPicker` (`src/components/SeriesPicker.tsx`, lists `kind: option` series from the manifest, flags `status: discontinued`), `ChartTypeToggle` (cumulative / daily) and `StatsTable` (`src/components/StatsTable.tsx`, uses `calc.periodStats`).
- [ ] T048 [US2] `ChartPage` in `apps/web-superlens/src/pages/ChartPage.tsx` composing the above; selection, period and chart type kept in the URL query string so a view can be bookmarked; App shell with nav (Chart, Snapshot, Watchlist, Sources) in `src/App.tsx`, mobile-first CSS in `src/index.css`.
- [ ] T049 [US2] `SourcesPage` in `apps/web-superlens/src/pages/SourcesPage.tsx`: each source's last successful update, last error and backfill state; latest runs; a **Refresh** button calling `POST /api/v1/refresh` and polling `GET /api/v1/runs/{id}` every 3 s until finished; shows "Updated less than 5 minutes ago" on 429 and "An update is already running" on 409 (US1.3, US1.6).
- [ ] T050 [US2] Vite dev proxy in `apps/web-superlens/vite.config.ts`: `/data` and `/api` → `http://localhost:8080` (local API from T037).
- [ ] T051 [US2] Frontend stack in `infra/projects/web-superlens/lib/stack.ts` and `bin/app.ts`: read `process.env.SUPERLENS_BACKEND_DOMAIN`, default `backend.invalid` with `Annotations.of(stack).addWarning(...)`; `StaticSite` with `proxies`: `/data/v1/manifest.json` (custom cache policy, default/max TTL 60 s, honours origin headers), `/data/*` (`CachePolicy.CACHING_OPTIMIZED`, GET/HEAD), `/api/*` (caching disabled for writes; all methods; `ALL_VIEWER_EXCEPT_HOST_HEADER`). Keep the template's web build step.
- [ ] T052 [US2] Deploy MVP — **OWNER APPROVAL**: `just infra-diff superlens-go`, `just infra-deploy superlens-go`, export `SUPERLENS_BACKEND_DOMAIN`, `just infra-deploy web-superlens`; first Refresh; run quickstart V1, V3, V6, V15.

**Checkpoint (MVP)**: US1 + US2 deployed in both projects; the owner can open the web URL on a phone and
chart any options from stored history.

---

## Phase 5: User Story 3 — Compare against market indices (P2)

**Goal**: All Ords, S&P 500, FTSE 100 and MSCI EM (EEM proxy) plus AUD/USD and AUD/GBP stored with the same
delta rule, drawn on the same baseline, with an AUD / local toggle that uses each date's own FX rate.

**Independent Test**: quickstart V7. Chart one option with All Ords and S&P 500 over a month; index changes
match published closes; toggling AUD ↔ local redraws the S&P 500 line and switches the label.

### Tests for User Story 3

- [ ] T053 [P] [US3] Yahoo adapter test in `apps/superlens-go/internal/source/yahoo/adapter_test.go` with recorded responses from T001: timestamps converted to each market's own trading date (`^AORD` Australia/Sydney, `^GSPC` and `EEM` America/New_York, `^FTSE` Europe/London), never shifted to the Sydney date; null closes skipped; HTTP 429/5xx → error, no points.
- [ ] T054 [P] [US3] Frankfurter adapter test in `apps/superlens-go/internal/source/frankfurter/adapter_test.go` with the recorded range: produces `frankfurter.aud-usd` and `frankfurter.aud-gbp` levels (quote currency per 1 AUD).
- [ ] T055 [P] [US3] Web test in `apps/web-superlens/src/components/CurrencyToggle.test.tsx` and an extra case in `ChartPage.test.tsx`: default view is AUD (FR-006e); toggling changes the S&P 500 values via `calc.audConvert` and the label "AUD view" / "Local currency"; index lines show "price index" and EEM shows "MSCI EM (EEM proxy)"; FX gaps > 5 days are noted on the chart.

### Implementation for User Story 3

- [ ] T056 [P] [US3] Yahoo adapter in `apps/superlens-go/internal/source/yahoo/adapter.go`: source `{id: "yahoo", name: "Market indices (Yahoo Finance)", visibility: "private", attribution: "Index data: Yahoo Finance", mode: fetch, maxRangeDays: 3650}`; series `yahoo.aord` (All Ordinaries, AU, AUD), `yahoo.gspc` (S&P 500, US, USD), `yahoo.ftse` (FTSE 100, UK, GBP), `yahoo.eem` (name "MSCI EM (EEM proxy)", EM, USD); all `kind: index`, `valueType: level`, `note: "price index, excludes dividends"` (EEM: "EEM ETF proxy; price only"). At most 1 request per second.
- [ ] T057 [P] [US3] Frankfurter adapter in `apps/superlens-go/internal/source/frankfurter/adapter.go`: source `{id: "frankfurter", name: "Exchange rates (ECB via Frankfurter)", visibility: "public", attribution: "Exchange rates: ECB", mode: fetch}`; series `frankfurter.aud-usd`, `frankfurter.aud-gbp` (`kind: fx`, `valueType: level`, `market: FX`, `currency` = quote currency).
- [ ] T058 [US3] Register both adapters in `apps/superlens-go/internal/source/source.go` `All()` so the update job (T033) backfills and updates them like AustralianSuper; adding them must not touch existing series (FR-006b).
- [ ] T059 [US3] `CurrencyToggle` in `apps/web-superlens/src/components/CurrencyToggle.tsx` and a comparison picker in `SeriesPicker.tsx` (kinds `index`); `ChartPage` loads the needed `frankfurter.aud-*` series when a non-AUD series is shown in AUD view and converts with `calc.audConvert`; labels currency when not AUD (FR-006c); the toggle state is in the URL.

**Checkpoint**: Indices and FX update daily; the AUD view uses per-date rates (fixture 08 passes in both languages).

---

## Phase 6: User Story 4 — Maintain a watchlist (P2)

**Goal**: Mark options as invested or considering; the default chart and snapshot open on them with the
last-used period and currency view.

**Independent Test**: quickstart V8. Mark 2 invested + 1 considering, reload on a phone; the same three open
by default, grouped.

### Tests for User Story 4

- [ ] T060 [P] [US4] API tests in `apps/superlens-go/internal/api/watchlist_test.go`: `GET /api/v1/watchlist` returns `{invested: [...], considering: [...]}`; `PUT /api/v1/watchlist/{seriesId}` with `{group}` (`invested|considering`) stores `OWNER/WATCH#<seriesId>` with `addedAt`; unknown series → 404; bad group → 400; `DELETE` removes it; `PUT /api/v1/preferences` stores `OWNER/PREFS` (period, currency view, comparison series); writes respond `Cache-Control: no-store`; `GET /api/v1/watchlist` is **not** cached at the edge (`Cache-Control: no-store`) so edits show immediately.
- [ ] T061 [P] [US4] Web test in `apps/web-superlens/src/pages/WatchlistPage.test.tsx` and `ChartPage.test.tsx`: marking options calls the API; opening Chart with no query string selects the watchlist series grouped "Invested" / "Considering" with the saved period; a discontinued watchlist option is still shown with its history and a "no longer published" flag (US4.3).

### Implementation for User Story 4

- [ ] T062 [US4] Watchlist and preferences handlers in `apps/superlens-go/internal/api/watchlist.go` (`getWatchlist`, `putWatchlistEntry`, `deleteWatchlistEntry`, `putPreferences`), store methods already defined in T016/T017.
- [ ] T063 [US4] `WatchlistPage` in `apps/web-superlens/src/pages/WatchlistPage.tsx`: list all options with invested / considering / none controls; writes go through `send()` (T010) so `x-amz-content-sha256` is set.
- [ ] T064 [US4] Default chart in `apps/web-superlens/src/pages/ChartPage.tsx`: with no query string, load watchlist + preferences and open on them; save period/currency changes to preferences (debounced 1 s).

**Checkpoint**: Watchlist persists across devices and drives the default chart.

---

## Phase 7: User Story 5 — Morning snapshot (P3)

**Goal**: One-glance day / week / month changes for watchlist options and comparison series, with a stale-data
warning.

**Independent Test**: quickstart V9 and spec US5 test: figures match stored data; stale data shows a warning.

- [ ] T065 [P] [US5] Snapshot calc in `apps/web-superlens/src/lib/snapshot.ts` with tests `snapshot.test.ts`: for each series the latest date, 1-day, 1-week and 1-month change via `calc.cumulativeReturn`; `isStale(lastSuccessAt, latestDate, now)` true when not updated since the last business day (learned from AustralianSuper dates).
- [ ] T066 [US5] `SnapshotPage` in `apps/web-superlens/src/pages/SnapshotPage.tsx` with `SnapshotPage.test.tsx`: rows for watchlist options (grouped) then comparison series from preferences, each with latest date and 1D/1W/1M change; a prominent warning banner with the last successful update time when stale; disclaimer footer (FR-017). Make it the landing page after the first visit when a watchlist exists.

**Checkpoint**: All five user stories work independently.

---

## Phase 8: Data interface and AI (FR-015, FR-015a/b, research R15)

**Purpose**: Read-only API for tools, CSV export, the MCP server with `import`, and the Claude skill.

- [ ] T067 [P] API tests in `apps/superlens-go/internal/api/values_test.go` and `performance_test.go`: `GET /api/v1/series?kind=` lists the catalogue; `GET /api/v1/series/{id}/values?from&to&currency=AUD|local` returns `{points, gaps}` (AUD conversion via `calc.AUDConvert`) and `?format=csv` returns `text/csv` with `Content-Disposition: attachment` (FR-015); `GET /api/v1/performance?seriesIds=a,b&from&to&currency` returns `PeriodStats` per series (1–20 ids, else 400); all carry `disclaimer` and `Cache-Control: public, max-age=60, s-maxage=300`; 10 years of one series answers in < 3 s from the memory store (SC-001b).
- [ ] T068 Implement `listSeries`, `getSeriesValues` (JSON + CSV) and `comparePerformance` in `apps/superlens-go/internal/api/series.go`, reading chunks through an in-memory LRU of decoded chunks keyed by hash (`internal/store/chunkcache.go`, 256 entries; safe because chunks are immutable, R5). If CSV export isn't in the contract yet, add the `format` query parameter to `contracts/superlens.openapi.yaml` first and regenerate (T009, T010).
- [ ] T069 [P] CSV export button in `apps/web-superlens/src/pages/ChartPage.tsx` linking to `/api/v1/series/{id}/values?from&to&currency&format=csv` for each selected series (FR-015).
- [ ] T070 MCP server in `apps/superlens-go/cmd/superlens-mcp/main.go` and `internal/mcp/tools.go` per [contracts/mcp-tools.md](./contracts/mcp-tools.md): stdio transport (`modelcontextprotocol/go-sdk`); env `SUPERLENS_URL` required; tools `list_series`, `get_series_values` (refuse ranges over 10 years), `compare_performance`, `get_update_status`, `get_watchlist`, `request_refresh` mapping to the API calls listed there; resource `superlens://series/{seriesId}` (metadata + last 30 values); every result includes `disclaimer: "Data and calculations only; not financial advice."`; API errors pass through as tool errors with `code` and `message`. Tests in `internal/mcp/tools_test.go` against an `httptest` API.
- [ ] T071 `import` subcommand in `apps/superlens-go/cmd/superlens-mcp/import.go`: `superlens-mcp import <sourceId> <file.csv>` validates the file locally with the source parser, then uploads to `s3://<bucket>/imports/<sourceId>/<UTC timestamp>.csv` using the default AWS credential chain (`AWS_PROFILE`); bucket from `--bucket` or env `SUPERLENS_BUCKET`. No public endpoint (FR-016b). Test parse-before-upload with a fake S3 client.
- [ ] T072 [P] Claude skill `.claude/skills/superlens-analyst/SKILL.md`: frontmatter `name`/`description`; how to use the MCP tools; a morning-brief workflow (`get_update_status` → `get_watchlist` → `compare_performance` over 1D/1W/1M/FYTD); a "compare options over cycles" workflow; chart conventions (cumulative from a common baseline, AUD view by default, "price index" caveat); and the FR-017 rule: present data and calculations only, never recommend buying, selling or switching.

---

## Phase 9: Polish and hardening

- [ ] T073 Budget and anomaly detection in `infra/projects/superlens-go/lib/stack.ts`: `budgets.CfnBudget` $5/month cost budget with an email subscriber from context/env `SUPERLENS_BUDGET_EMAIL` (no address committed to the repo; synth skips the subscriber with a warning when unset); `ce.CfnAnomalyMonitor` (dimensional, SERVICE) + `ce.CfnAnomalySubscription` to the same email. Extend `stack.test.ts`.
- [ ] T074 [P] Logs: 2-week retention on both Lambdas; structured `slog` JSON logs in `cmd/superlens` and `cmd/superlens-update` with `runId`, `sourceId`, `daysAdded`, `daysRevised`, errors.
- [ ] T075 [P] Performance check in `apps/web-superlens/src/components/Chart.perf.test.ts`: 10 series × 25 years of generated daily data, rebase + period change computes in < 2 s in Vitest (SC-003 proxy).
- [ ] T076 [P] Update `apps/superlens-go/README.md` and `apps/web-superlens/README.md`: local run (quickstart §1), env vars (`SUPERLENS_STORE`, `SUPERLENS_BUCKET`, `SUPERLENS_TABLE`, `SUPERLENS_DISTRIBUTION_ID`, `SUPERLENS_UPDATE_FUNCTION`, `SUPERLENS_FAULT`, `SUPERLENS_URL`), the no-auth v1 caveat and the "Before going public" checklist (research R18).
- [x] T077 (Done during plan update, 2026-11-13.) Fix the leftover research inconsistency: in `specs/003-super-option-tracker/research.md` R7 decision step 3, replace the "authenticated `POST /api/v1/sources/{id}/imports` endpoint" with "`superlens-mcp import` uploads it to `s3://…/imports/` with the owner's AWS credentials (FR-016b)".
- [ ] T078 Full local verification: `just lint test build`, `just infra-synth superlens-go`, `just infra-synth web-superlens` (expect the placeholder warning).
- [ ] T079 Post-deploy validation — **OWNER APPROVAL** for the redeploys: run quickstart V1–V16, including V10 (no write path through the address), V11 (SC-001b), V13 (flood test, cache hit rate > 99%, no Lambda invocations), V14 (MCP in Claude Code) and V16 (new day visible within 1 minute). Record results in `specs/003-super-option-tracker/quickstart.md` or the PR.

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 (Setup)**: T001 spike first (it decides `mode`, CSV layout and range limits). T002/T003 can run
  alongside T001.
- **Phase 2 (Foundational)**: after T002/T003. Blocks all stories.
- **US1 (Phase 3)**: after Phase 2. Needs T001's recorded CSV for T026/T031.
- **US2 (Phase 4)**: after Phase 2; runs locally against fixtures or US1's `file://` data. The MVP deploy (T052) needs US1 + US2.
- **US3 (Phase 5)**: after US1 (reuses the update job) and US2 (chart).
- **US4 (Phase 6)**: after US2 (default chart); API part only needs Phase 2.
- **US5 (Phase 7)**: after US4 (watchlist) and US3 (comparison series); works with options only if US3 is skipped.
- **Phase 8**: after US1 (data in store); T070 after T068; T071 after T034.
- **Phase 9**: after the stories you intend to ship.

### Key task dependencies

- T009 → all `internal/api` handlers (T036, T062, T068)
- T011–T015 → T031, T033; T016/T017 → T033, T036
- T019 → T021, T022; T001 → T020, T026, T031, T053, T054
- T023 → T038; T024 → T051
- T033 → T034, T035, T058; T036/T037 → T049, T050
- T038 → T051 (needs the backend domain at deploy time only, not at synth)

### Parallel opportunities

- Phase 1: T003, T005, T007 while T001 runs.
- Phase 2: T011–T015 (separate files) in parallel; T021 and T022 in parallel after T019; T023, T024, T025 in parallel with all Go work.
- US1: T026–T030 tests in parallel; T038 (infra) in parallel with T031–T037 (Go).
- US2: T040–T043, then T044, T045–T047 in parallel; T051 in parallel with the web work.
- US3: T053–T057 in parallel (adapters are separate packages).
- US4 API (T060, T062) in parallel with US3.
- Phase 8: T069 and T072 in parallel with T070/T071.

## Parallel example: User Story 1

```text
Task: "AustralianSuper adapter test in apps/superlens-go/internal/source/australiansuper/adapter_test.go"
Task: "Lock tests in apps/superlens-go/internal/update/lock_test.go"
Task: "API handler tests in apps/superlens-go/internal/api/refresh_test.go and sources_test.go"
Task: "Backend stack test in infra/projects/superlens-go/test/stack.test.ts"
```

## Parallel example: User Story 3

```text
Task: "Yahoo adapter in apps/superlens-go/internal/source/yahoo/adapter.go"
Task: "Frankfurter adapter in apps/superlens-go/internal/source/frankfurter/adapter.go"
Task: "CurrencyToggle in apps/web-superlens/src/components/CurrencyToggle.tsx"
```

## Implementation Strategy

### MVP first (US1 + US2)

1. Phase 1: spike decides fetch vs import; scaffold both apps.
2. Phase 2: contract, generated code, core packages, calc + fixtures, `infra/common` changes.
3. Phase 3 (US1): history and updates working locally with `file://`.
4. Phase 4 (US2): web chart locally, then the two-project deploy (T052, owner approval).
5. **Stop and validate** with quickstart V1, V3, V6, V15. Use it for a few mornings.

### Incremental delivery

1. MVP (US1 + US2) → deploy.
2. US3 (indices + AUD view) → deploy → V7.
3. US4 (watchlist) → deploy → V8.
4. US5 (snapshot) → deploy → V9.
5. Phase 8 (data interface, MCP, skill) → V11, V12, V14.
6. Phase 9 (budget, flood test, full V1–V16).

### If the spike says "import"

US1 still ships: the `australiansuper` source runs in `mode: import`, T034 and T071 move up to be built
right after T033, and the 07:00 schedule keeps indices and FX current. The owner downloads the CSV in the
browser as today and runs `superlens-mcp import australiansuper <file.csv>`.

## Notes

- [P] = different files, no dependency on unfinished tasks.
- Commit after each task or logical group; no AI attribution.
- Every deploy and destroy needs the owner's explicit approval.
