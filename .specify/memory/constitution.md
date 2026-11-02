<!--
Sync Impact Report
- Version change: (template) → 1.0.0
- Added principles: I. Spec Before Substance, II. Right Language, Declared Scope,
  III. Contracts at the Seams, IV. Tests Prove It, V. One Command Surface,
  VI. Disposable by Design
- Added sections: Monorepo Layout & Tooling, Development Workflow, Governance
- Templates: plan-template override created at .specify/templates/overrides/plan-template.md ✅
-->

# BlueBelle Constitution

BlueBelle is a personal polyglot playground for ideas, written in Go, Python,
TypeScript and React. It is organized as one monorepo and uses spec-driven
development (GitHub Spec Kit).

## Core Principles

### I. Spec Before Substance
Every new app, package, or cross-language change starts with a spec in
`specs/NNN-feature/` created via `/speckit-specify`. Specs describe *what* and
*why*, with no technology choices; the plan (`/speckit-plan`) decides *how*.
Exception: throwaway spikes (< 1 day, under `apps/` with a `-spike` suffix or
in a scratch branch) may skip the spec, but a spike that survives becomes a
spec'd feature before it grows further.

### II. Right Language, Declared Scope
Every plan MUST list each app/package it creates or modifies, the language
used, and a one-line justification. Default choices:
- **Go**: long-running services, CLIs, concurrency-heavy or performance-sensitive work.
- **Python**: data, ML/AI, scripting, quick backend prototypes (FastAPI).
- **React + TypeScript**: browser UIs.
- **TypeScript (Node)**: tooling or services that share code with a web app.
Deviating from a default is fine but MUST be justified in the plan.

### III. Contracts at the Seams
When two components in different languages talk to each other, the interface
is defined first in `contracts/` (OpenAPI for HTTP, Protobuf for RPC/events)
and client/server types are generated or validated from it. Contract changes
are reviewed as part of the spec. Components in the same language may share
code directly through `packages/<lang>/`.

### IV. Tests Prove It
Every user story in a spec maps to at least one automated test. Write tests
before or alongside implementation; a task is not done until its tests pass.
- Go: `go test` with table-driven tests; `httptest` for HTTP.
- Python: `pytest`; FastAPI `TestClient` for HTTP.
- React/TS: Vitest + Testing Library; test behaviour, not implementation.
Cross-language features add a contract or integration test at the seam.

### V. One Command Surface
`just` is the single entry point. `just lint`, `just test` and `just build`
MUST pass from a clean checkout after `just setup`. Every new app MUST be
reachable by these recipes, either automatically via the naming rules below
or by updating the `justfile`. Tool versions are pinned in `.mise.toml`; do
not rely on globally installed toolchains.

### VI. Disposable by Design
This is a playground: optimize for learning speed and easy deletion. Apps
MUST NOT import from other apps (only from `packages/`), so any app can be
removed by deleting its folder and its workspace entry. Prefer the standard
library and small dependencies; YAGNI over speculative abstraction.

## Monorepo Layout & Tooling

| Path | Purpose | Tooling |
|------|---------|---------|
| `apps/<name>-go` | Go modules | `go.work`, golangci-lint, `go test` |
| `apps/<name>-py` | Python packages (src layout) | uv workspace, ruff, pytest |
| `apps/web-<name>` | React + Vite apps | pnpm workspace, biome, Vitest |
| `apps/<name>-ts` | Node/TS apps | pnpm workspace, biome, Vitest |
| `packages/{go,py,ts}/<name>` | Shared libraries | same as language above |
| `contracts/` | OpenAPI / Protobuf definitions | — |
| `specs/` | Spec Kit feature specs | `/speckit-*` skills |

- Scaffold with `just new-go <name>`, `just new-py <name>`, `just new-web <name>`.
- Go module paths are `bluebelle/<path>`.
- Python requires 3.13+, TypeScript runs in `strict` mode, and Go uses the version in `.mise.toml`.
- Secrets never go in the repo; use `.env` (gitignored) with a committed `.env.example`.

## Development Workflow

1. `/speckit-specify <idea>` creates branch `NNN-short-name` and `specs/NNN-short-name/spec.md`.
2. `/speckit-clarify`: resolve ambiguities (recommended for anything non-trivial).
3. `/speckit-plan`: choose languages and paths per Principle II, and define contracts per Principle III.
4. `/speckit-tasks`, then optionally `/speckit-analyze` for consistency.
5. `/speckit-implement`: implement in task order, keeping `just lint test` green.
6. Merge the feature branch into `main` once `just lint test build` passes. CI must be green.

## Governance

This constitution overrides ad-hoc conventions. Plans MUST include a
Constitution Check confirming compliance, or explicitly justify each
deviation in the plan's Complexity Tracking table. Amend via
`/speckit-constitution`, bumping the version: MAJOR for removed or redefined
principles, MINOR for new principles or sections, PATCH for wording.
Day-to-day agent guidance lives in `CLAUDE.md`.

**Version**: 1.0.0 | **Ratified**: 2026-11-02 | **Last Amended**: 2026-11-02
