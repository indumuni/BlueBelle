# BlueBelle

A polyglot monorepo playground for ideas in **Go**, **Python**, **TypeScript** and **React**,
built with spec-driven development using [GitHub Spec Kit](https://github.com/github/spec-kit).

## Quick start

```sh
brew install mise                      # once
mise trust && mise install             # go, node, python, pnpm, uv, just, golangci-lint
just setup                             # install all deps
just lint test build                   # verify everything
```

`just setup` also enables the repo's git hooks (`.githooks/`). The `commit-msg` hook enforces
the constitution's **Commit Authorship** rule: commits come from real people, with no AI
co-author or "Generated with" lines.

Add `eval "$(mise activate zsh)"` to `~/.zshrc` so the pinned tools are on your PATH
whenever you `cd` into the repo.

## Layout

```
apps/
  api-go/        sample Go HTTP service      go run ./apps/api-go/cmd/api
  svc-py/        sample FastAPI service      uv run svc-py
  web-react/     sample Vite + React app     pnpm --filter web-react dev
  api-ts/        sample Hono (TS) service    pnpm --filter api-ts dev
templates/<kind>/{app,infra}/  sources for just new-go|new-py|new-web|new-ts
scripts/               scaffold generator (new-app.mjs) and repo checks
packages/{go,py,ts}/   shared libraries
contracts/             OpenAPI / Protobuf for cross-language interfaces
infra/projects/<name>/ one AWS CDK app per project (deploy/destroy independently)
infra/common/          reusable CDK constructs: VPC, static site, HTTP Lambda
infra/shared/          resources deployed once per stage (VPC)
specs/                 Spec Kit feature specs
.specify/              Spec Kit constitution, templates, scripts
```

The sample apps were generated from `templates/` (`just new-go api`, `new-py svc`,
`new-web react`, `new-ts api`). They're smoke tests for the tooling; delete any of them
whenever you like.

## Starting a new idea

Each command creates the app **and** its AWS infra project from `templates/<kind>`,
registers it with its workspace and installs dependencies. It refuses (and writes
nothing) if either folder already exists.

```sh
just new-go  my-idea     # → apps/my-idea-go   + infra/projects/my-idea-go   (Lambda + HTTP API)
just new-py  my-idea     # → apps/my-idea-py   + infra/projects/my-idea-py   (Lambda + HTTP API)
just new-web my-idea     # → apps/web-my-idea  + infra/projects/web-my-idea  (S3 + CloudFront)
just new-ts  my-idea     # → apps/my-idea-ts   + infra/projects/my-idea-ts   (Lambda + HTTP API)
```

To change what new apps look like, edit `templates/` (see [`templates/README.md`](templates/README.md)).

For anything bigger than a spike, start with a spec in Claude Code:

1. `/speckit-specify <describe the idea>`
2. `/speckit-clarify`
3. `/speckit-plan` (picks languages and paths, defines contracts)
4. `/speckit-tasks`
5. `/speckit-implement`

The project principles are in [`.specify/memory/constitution.md`](.specify/memory/constitution.md).

## Commands

| Command | What it does |
|---------|--------------|
| `just setup` | Install tools and dependencies |
| `just lint` / `just fmt` | Lint or format all languages |
| `just test` | Run all tests |
| `just build` | Build Go and TS/React apps |
| `just lint-go`, `just test-py`, … | Per-language variants |
| `just infra-deploy <project> [stage]` | Deploy one project's AWS infra; see [`infra/README.md`](infra/README.md) |
| `just infra-destroy <project> [stage]` | Tear down one project's AWS infra |
| `just new-infra <name>` | Scaffold infra for a project |
