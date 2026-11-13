# MCP Contract: `superlens-mcp`

A local stdio MCP server (`apps/superlens-go/cmd/superlens-mcp`). It is a thin client of
[superlens.openapi.yaml](./superlens.openapi.yaml) and holds no data of its own.

Configuration (environment variables):

| Var | Required | Meaning |
|---|---|---|
| `SUPERLENS_URL` | yes | e.g. `https://dxxxx.cloudfront.net` |
| `SUPERLENS_API_KEY` | yes | owner-issued key `sl_…` (never committed) |

## Tools

| Tool | Input | Output | API call |
|---|---|---|---|
| `list_series` | `{ kind?: option\|index\|fx\|other }` | series catalogue (id, name, kind, currency, note, first/last date, status) | `GET /api/v1/series` |
| `get_series_values` | `{ seriesId, from, to, currency?: AUD\|local }` | `{ points: [{date, value}], gaps }`; refuses ranges over 10 years per call to keep context small | `GET /api/v1/series/{id}/values` |
| `compare_performance` | `{ seriesIds[1..20], from, to, currency?: AUD\|local }` | period stats per series (total return, best/worst day, largest fall, note) | `GET /api/v1/performance` |
| `get_update_status` | `{}` | each source's last success, last error and backfill state, plus the latest run | `GET /api/v1/sources`, `GET /api/v1/runs?limit=1` |
| `get_watchlist` | `{}` | invested / considering entries | `GET /api/v1/watchlist` |
| `request_refresh` | `{}` | run id, or "already running" / "cooldown, retry in Ns" | `POST /api/v1/refresh` |

Every tool result carries `disclaimer: "Data and calculations only; not financial advice."` (FR-017).

## Resources

- `superlens://series/{seriesId}`: series metadata plus the last 30 values (for quick context).

## CLI subcommand (same binary)

- `superlens-mcp import <sourceId> <file.csv>`: research R7 fallback; `POST /api/v1/sources/{id}/imports`.

## Errors

API errors are passed through as MCP tool errors with the API's `code` and `message`. A 401 tells the user
to check `SUPERLENS_API_KEY`.
