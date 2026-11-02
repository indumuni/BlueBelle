# BlueBelle

Polyglot monorepo playground (Go, Python, TypeScript/React) using spec-driven
development with GitHub Spec Kit. The rules live in
`.specify/memory/constitution.md`; read it before planning features.

## Commands
- `just setup`: install pinned tools (mise) and all deps
- `just lint` / `just test` / `just build`: run across all languages
- `just lint-go|lint-py|lint-ts`, `just test-go|test-py|test-ts`: per language
- `just fmt`: auto-format everything
- `just new-go <name>` / `just new-py <name>` / `just new-web <name>`: scaffold an app

Tools are pinned in `.mise.toml`. If a tool isn't found, run `eval "$(mise env -s bash)"`
or prefix commands with `mise exec --`.

## Layout
- `apps/<name>-go`: Go modules, listed in `go.work`, module path `bluebelle/apps/<name>-go`
- `apps/<name>-py`: uv workspace members, src layout, tests in `tests/`
- `apps/web-<name>`: Vite + React + TS, Vitest + Testing Library
- `packages/{go,py,ts}/`: shared libraries. Apps never import from other apps.
- `contracts/`: OpenAPI/Protobuf for anything crossing a language boundary
- `specs/NNN-feature/`: Spec Kit specs, plans and tasks

## Conventions
- TS/React: biome (2-space, double quotes), strict TS, no non-null assertions
- Python: ruff (line length 100), type hints, pytest
- Go: gofmt/goimports, golangci-lint (`.golangci.yml`), table-driven tests
- Run `just lint test` before declaring work done.

## Spec Kit flow
`/speckit-specify` → `/speckit-clarify` → `/speckit-plan` → `/speckit-tasks` →
(`/speckit-analyze`) → `/speckit-implement`. Each feature gets its own branch
`NNN-short-name`. The plan template is overridden at
`.specify/templates/overrides/plan-template.md` to use the monorepo layout.
