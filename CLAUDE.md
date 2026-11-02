# BlueBelle

Polyglot monorepo playground (Go, Python, TypeScript/React) using spec-driven
development with GitHub Spec Kit. The rules live in
`.specify/memory/constitution.md`; read it before planning features.

## Commands
- `just setup`: install pinned tools (mise) and all deps
- `just lint` / `just test` / `just build`: run across all languages
- `just lint-go|lint-py|lint-ts`, `just test-go|test-py|test-ts`: per language
- `just fmt`: auto-format everything
- `just infra-list`, `just infra-synth|infra-diff|infra-deploy|infra-destroy <target> [stage]`: AWS CDK
  per project (`<target>` is `shared` or a name under `infra/projects/`)
- `just new-go|new-py|new-web|new-ts <name>`: scaffold an app **plus** its `infra/projects/<app>`
  from `templates/<kind>/{app,infra}` (via `scripts/new-app.mjs`; refuses if either folder exists)
- `just new-infra <name>`: empty `infra/projects/<name>` for stacks that don't belong to an app
- `just test-scripts`: generator tests (part of `just test`); `just test-templates`: CI only,
  scaffolds every kind and runs lint/test/build/synth

Tools are pinned in `.mise.toml`. If a tool isn't found, run `eval "$(mise env -s bash)"`
or prefix commands with `mise exec --`.

## Layout
- `apps/<name>-go`: Go modules, listed in `go.work`, module path `bluebelle/apps/<name>-go`
- `apps/<name>-py`: uv workspace members, src layout, tests in `tests/`
- `apps/web-<name>`: Vite + React + TS, Vitest + Testing Library
- `apps/<name>-ts`: Node backend on Hono, Vitest (`app.request()`), runs on Lambda via `nodeWebCode`
- `templates/<kind>/{app,infra}`: scaffold sources with `__NAME__`/`__BASE__`/`__PKG__`/`__PASCAL__`
  placeholders. Not in any workspace, ignored by biome/ruff; change them instead of hand-editing
  new apps. See `templates/README.md`.
- `packages/{go,py,ts}/`: shared libraries. Apps never import from other apps.
- `contracts/`: OpenAPI/Protobuf for anything crossing a language boundary
- `infra/projects/<name>`: one independent CDK app per app (same name as `apps/<name>`)
- `infra/common`: reusable constructs (`StandardVpc`, `StaticSite`, `HttpLambda`, `createProjectApp`)
- `infra/shared`: deploy-once resources (per-stage VPC). Projects never reference each other's stacks.
  See `infra/README.md`.
- `specs/NNN-feature/`: Spec Kit specs, plans and tasks

## Conventions
- TS/React: biome (2-space, double quotes), strict TS, no non-null assertions
- Python: ruff (line length 100), type hints, pytest
- Go: gofmt/goimports, golangci-lint (`.golangci.yml`), table-driven tests
- Run `just lint test` before declaring work done.
- Commits and PRs are authored by the user only. Never add `Co-Authored-By`, "Generated with" or any
  other AI attribution (constitution: Commit Authorship; enforced by `.githooks/commit-msg` and CI).
- Never run `just cdk-bootstrap`, `just infra-deploy`, `just infra-destroy` (or raw `cdk deploy/destroy`)
  without explicit user approval.

## Spec Kit flow
`/speckit-specify` → `/speckit-clarify` → `/speckit-plan` → `/speckit-tasks` →
(`/speckit-analyze`) → `/speckit-implement`. Each feature gets its own branch
`NNN-short-name`. The plan template is overridden at
`.specify/templates/overrides/plan-template.md` to use the monorepo layout.
