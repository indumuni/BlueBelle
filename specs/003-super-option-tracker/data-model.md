# Data Model: Super Investment Option Tracker (SuperLens)

**Feature**: [spec.md](./spec.md) | **Research**: [research.md](./research.md) (R4–R6, R12, R14)

There are two stores:

- **S3 bucket** `bb-superlens-go-<stage>-data` (backend project): series values as immutable year chunks, plus manifests.
- **DynamoDB table** `bb-superlens-go-<stage>` (backend project): single table holding metadata and state, on-demand billing,
  with TTL on the `expiresAt` attribute.

The wire shapes of manifests and chunks are defined in
[contracts/superlens.openapi.yaml](./contracts/superlens.openapi.yaml) (`Manifest`, `Chunk`).

## Identifiers

| Thing | Format | Example |
|---|---|---|
| Source id | `^[a-z][a-z0-9-]{1,30}$` | `australiansuper`, `yahoo`, `frankfurter` |
| Series id | `<sourceId>.<slug>`, slug `^[a-z0-9-]{1,60}$` | `australiansuper.high-growth`, `yahoo.gspc`, `frankfurter.aud-usd` |
| Date | ISO `YYYY-MM-DD`, the **market's own trading date** | `2026-10-31` |
| Run id | ULID | `01JC9Z…` |

A series id never changes. If a provider renames an option but keeps its identifier, only `name` changes.
If the provider's identifier changes, the result is a new series (spec edge case).

## Entities

### DataSource

| Field | Type | Rules |
|---|---|---|
| id | string | see Identifiers |
| name | string | display name, e.g. "AustralianSuper daily rates" |
| visibility | `public` \| `private` | from the source's republishing terms (R6); recorded, not enforced in v1 (R18) |
| attribution | string | shown in the UI footer, e.g. "Exchange rates: ECB" |
| mode | `fetch` \| `import` | `import` = owner-assisted (R7 fallback) |
| maxRangeDays | int | longest period allowed in one request |
| recheckBusinessDays | int | default 5 (FR-005) |
| lastSuccessAt | timestamp? | FR-007 |
| lastAttemptAt / lastError | timestamp? / string? | shown when the last update failed |
| backfill | `{ state: pending\|running\|complete, cursor: date? }` | FR-002, resumable |

### Series

| Field | Type | Rules |
|---|---|---|
| id | string | `<sourceId>.<slug>` |
| sourceId | string | → DataSource |
| name | string | as published, e.g. "High Growth" |
| providerKey | string | the provider's own column name or ticker |
| kind | `option` \| `index` \| `fx` \| `other` | FR-006a |
| valueType | `return_pct` \| `level` | options = daily % return; indices and FX = level |
| market | string | `AU`, `US`, `UK`, `EM`, `FX` |
| currency | ISO 4217 | `AUD`, `USD`, `GBP`; FX series: quote currency per 1 AUD |
| visibility | `public` \| `private` | inherited from the source; recorded, not enforced in v1 |
| note | string? | e.g. "price index, excludes dividends", "EEM ETF proxy" |
| firstDate / lastDate | date | maintained by the update job |
| status | `active` \| `discontinued` | discontinued when absent from the provider for 10 business days (FR-014) |

### Point (stored inside chunks, not as separate records)

| Field | Type | Rules |
|---|---|---|
| date | date | unique within a series (FR-004, SC-005) |
| value | number | `return_pct`: % with up to 6 dp; `level`: up to 6 dp |
| revisedAt | timestamp? | set when a re-check replaced a different value (FR-005) |

### Chunk (S3 object)

- Key: `data/v1/series/<seriesId>/<year>.<hash12>.json` for every series (v1 has no private prefix, R18).
- `hash12` = first 12 hex characters of the SHA-256 of the canonical JSON body, so the name changes whenever
  the content changes, and objects are never overwritten in place.
- Body: `{ seriesId, year, points: [[date, value, revised?], …] }`, sorted by date. Arrays rather than
  objects keep it small.
- Headers: `Content-Type: application/json`, `Content-Encoding: gzip`,
  `Cache-Control: public, max-age=31536000, immutable`.

### Manifest (S3 object)

- `data/v1/manifest.json`, listing all series.
- Body: `{ generatedAt, sources: [DataSource summary], series: [Series + chunks: { "<year>": "<url>" }] }`.
- Headers: `Cache-Control: public, max-age=60, s-maxage=86400`; the path is invalidated on the backend
  distribution after every update that changed data.

### Import file (S3 object, fallback only)

- Key: `imports/<sourceId>/<timestamp>.csv`, written only with the owner's AWS credentials (FR-016b). The
  upload event starts an update run with `trigger = import`. Processed files are deleted after 30 days
  (lifecycle rule).

### WatchlistEntry (DynamoDB)

| Field | Type | Rules |
|---|---|---|
| seriesId | string | must exist; usually an option, but any series is allowed |
| group | `invested` \| `considering` | FR-013 |
| addedAt | timestamp | |

UI preferences (last-used period, currency view) are stored alongside as `PREFS` (FR-013, Story 4.2).

### UpdateRun (DynamoDB)

| Field | Type | Rules |
|---|---|---|
| runId | ULID | |
| trigger | `schedule` \| `manual` \| `import` | |
| startedAt / finishedAt | timestamp | |
| status | `running` → `succeeded` \| `partial` \| `failed` | `partial` = some sources failed |
| perSource | list of `{ sourceId, from, to, daysAdded, daysRevised, newSeries, error? }` | SC-002 evidence |
| expiresAt | epoch | TTL: 400 days |

### UpdateLock (DynamoDB)

A single item with `runId`, `leaseUntil` (now + 15 min) and `lastFinishedAt`. It is acquired by a conditional
put: no lock exists, or the lease has expired. Refresh is refused with `409` while a lease is active, or with
`429` within 5 minutes of `lastFinishedAt` (FR-008, FR-018).

## DynamoDB key design (single table)

| Item | PK | SK |
|---|---|---|
| DataSource | `SOURCE#<id>` | `META` |
| Series | `SOURCE#<sourceId>` | `SERIES#<seriesId>` |
| WatchlistEntry | `OWNER` | `WATCH#<seriesId>` |
| Preferences | `OWNER` | `PREFS` |
| UpdateRun | `RUNS` | `RUN#<runId>` (ULIDs sort by time) |
| UpdateLock | `LOCK` | `UPDATE` |

Access patterns: list sources and their series (one query per source, or a scan of under 100 items); get or
put a watchlist entry; list the latest runs (query `RUNS`, descending, with a limit);
take the lock. No GSIs are needed.

## State transitions

```text
DataSource.backfill:  pending ──first run──▶ running ──2 empty windows──▶ complete
                                     ▲            │
                                     └─ time budget hit (cursor saved) ─┘

Series.status:        active ──absent 10 business days──▶ discontinued ──reappears──▶ active

UpdateRun.status:     running ──▶ succeeded | partial | failed

```

## Validation rules (from the spec)

- A fetched response is accepted **only as a whole**. Any parse error, unknown date format, non-numeric
  value, or a column set that shrinks by more than half rejects the whole response for that source (FR-007).
- Dates must be on or before "today" in the market's time zone; future dates are rejected.
- AustralianSuper CSV (research R7, verified): line endings may be `\r`, `\n` or `\r\n`; the first column must
  be `Rate Date` with ISO dates; a row where **every** option is exactly `0` is a non-publishing day and is
  skipped, not stored. A `0` in some columns but not all is a real value and is stored.
- Option daily returns outside ±25% are rejected as implausible and reported, not stored.
- Merging is idempotent: storing the same response twice gives byte-identical chunks, so the hashes stay the
  same and no new objects are written (FR-004).

## Examples

Sample S3 objects (public and private chunks and manifests) and every DynamoDB item type are in
[testdata/](./testdata/README.md). They are illustrative; the values and hashes are made up.
