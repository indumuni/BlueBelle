# Contract: Scaffold Commands

## Commands

| Command | Kind | Creates |
|---|---|---|
| `just new-go <name>` | go | `apps/<name>-go`, `infra/projects/<name>-go` |
| `just new-py <name>` | py | `apps/<name>-py`, `infra/projects/<name>-py` |
| `just new-web <name>` | web | `apps/web-<name>`, `infra/projects/web-<name>` |
| `just new-ts <name>` | ts | `apps/<name>-ts`, `infra/projects/<name>-ts` |
| `just new-infra <name>` | (unchanged) | empty `infra/projects/<name>`, or `infra/shared` |
| `just test-templates` | all | CI only: scaffolds `tplcheck` of every kind, then lint/test/build/synth |

Each `new-<kind>` recipe calls `node scripts/new-app.mjs <kind> <name>`.

## Input

- `<name>` must match `^[a-z][a-z0-9-]*[a-z0-9]$|^[a-z]$`.
- `<kind>` must be one of `go`, `py`, `web`, `ts`.

## Behaviour and exit codes

| Case | Exit | stdout / stderr | Filesystem |
|---|---|---|---|
| Success | 0 | `created apps/<app>` and `created infra/projects/<app>` | Both folders written, app registered, deps installed |
| Bad or missing name or kind | 2 | usage line | unchanged |
| Template folder missing | 1 | `template templates/<kind>/<part> not found` | unchanged |
| `apps/<app>` or `infra/projects/<app>` exists | 1 | `<path> already exists` (lists each conflict) | unchanged |
| Registration or install failed | 1 | the failing command plus `created: <paths>; delete them to retry` | folders remain |

"Unchanged" means `git status --porcelain` output is identical before and after the command.

## Output guarantees (success)

- The app passes `just lint`, `just test` and `just build` with no manual edits.
- `just infra-synth <app>` succeeds without AWS credentials.
- Backends implement [health.openapi.yaml](./health.openapi.yaml) and read `PORT`. Defaults: Go 8080, Python 8000, TS 3000.
- No placeholder token (`__NAME__`, `__BASE__`, `__PKG__`, `__PASCAL__`) remains in any created file or path.
