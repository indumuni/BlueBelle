---
description: "Task list for 002-app-templates"
---

# Tasks: App Templates

**Input**: Design documents from `/specs/002-app-templates/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Included. The spec (FR-005) requires a test in every template, and constitution Principle IV requires a test for every user story. The generator gets its own `node:test` suite.

**Organization**: Tasks are grouped by user story, in spec priority order. Paths are repo-relative.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US4 from spec.md

## Placeholder reference (from data-model.md)

For `base = my-idea`:

| Token | go | py | web | ts |
|---|---|---|---|---|
| `__NAME__` | `my-idea-go` | `my-idea-py` | `web-my-idea` | `my-idea-ts` |
| `__BASE__` | `my-idea` | `my-idea` | `my-idea` | `my-idea` |
| `__PKG__` | `myideago` (dashes removed + `go`) | `my_idea_py` (dashes → `_` + `_py`) | `web_my_idea` | `my_idea_ts` |
| `__PASCAL__` | `MyIdeaGo` | `MyIdeaPy` | `WebMyIdea` | `MyIdeaTs` |

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the templates location and keep it invisible to project tooling (FR-002).

- [X] T001 Create the `templates/` folder with a `templates/README.md` that explains the `templates/<kind>/{app,infra}` layout, the four placeholder tokens and their derivation rules (copy the table above), and how to add a new kind.
- [X] T002 [P] Exclude templates from biome by adding `"!templates"` to `files.includes` in `biome.json`.
- [X] T003 [P] Exclude templates from ruff and pytest by adding `extend-exclude = ["templates"]` under `[tool.ruff]` and `norecursedirs = ["templates"]` under `[tool.pytest.ini_options]` in `pyproject.toml`.
- [X] T004 Check that `just lint` still passes, and that `go.work`, `pnpm-workspace.yaml` and the uv members don't match `templates/` (they shouldn't need any edit).

**Checkpoint**: an empty `templates/` exists and project-wide commands ignore it.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The generator is shared by every story. It must exist before any template can be scaffolded.

**⚠️ CRITICAL**: No user story can be verified until this phase is complete.

- [X] T005 Write `scripts/new-app.mjs <kind> <name>`, a dependency-free Node ESM script modelled on `infra/scripts/new-project.mjs`. It must:
  - Validate `kind` ∈ `go|py|web|ts` and `name` against `^[a-z][a-z0-9]*(-[a-z0-9]+)*$` (starts with a letter, single dashes between parts, no leading, trailing or double dash; this is the only name rule, as defined in [contracts/scaffold-cli.md](./contracts/scaffold-cli.md)). On failure, print usage and **exit 2**.
  - Compute `__NAME__`, `__BASE__`, `__PKG__` and `__PASCAL__` exactly as in the placeholder table.
  - **Before writing anything**, check that `templates/<kind>/app` and `templates/<kind>/infra` exist (otherwise print `template templates/<kind>/<part> not found` and **exit 1**). Also check that neither `apps/<__NAME__>` nor `infra/projects/<__NAME__>` exists (otherwise print `<path> already exists` for each conflict and **exit 1**).
  - Copy both template trees recursively, replacing tokens in path segments and in the contents of UTF-8 text files.
  - Print `created apps/<name>` and `created infra/projects/<name>`.
- [X] T006 Add registration to `scripts/new-app.mjs`. Run `go work use ./apps/<name>` for go and `uv sync --all-packages` for py, then `pnpm install` for every kind. Then **format the generated files**, because templates are excluded from the formatters and a long substituted name can push a line past the formatter width:
  - `pnpm biome check --write apps/<name> infra/projects/<name>` for every kind (it covers the TS/TSX/JSON in the web and ts apps and in every infra project);
  - `uv run ruff format apps/<name>` and `uv run ruff check --fix apps/<name>` for py;
  - `gofmt -w apps/<name>` for go.

  If a step fails, print the failing command plus `created: <paths>; delete them to retry` and **exit 1** without deleting anything.
  - Support `BB_ROOT=<dir>` (default: the repo root, derived from `import.meta.dirname`) so tests can run in a temp copy.
  - Support `--no-register` to skip registration and formatting.
- [X] T007 Write `scripts/new-app.test.mjs` using `node:test`. Each test runs against a temp `BB_ROOT` with a fake `templates/<kind>/{app,infra}` that contains token-bearing paths and contents, with `--no-register`. Cover:
  - (a) success writes both trees with every token replaced, and no `__[A-Z]+__` remains;
  - (b) an existing `apps/<name>` exits 1 and leaves the tree byte-identical;
  - (c) an existing `infra/projects/<name>` exits 1 and writes nothing;
  - (d) a bad name (`Bad_Name`, `1abc`, `abc-`, `-abc`, `a--b`, empty) exits 2, while `a`, `a1` and `my-idea-2` are accepted;
  - (e) an unknown kind exits 2;
  - (f) a missing template exits 1;
  - (g) `my-idea` produces `__PKG__` `myideago` for go and `my_idea_py` for py;
  - (h) a long name (`a-very-long-project-name-for-checks`) is accepted and every placeholder is replaced. Formatting of long names is proven end to end by T036, which scaffolds with that same long name.
- [X] T008 Add a `test-scripts` recipe (`node --test scripts/`) to `justfile` and include it in `test` (`test: test-ts test-py test-go test-scripts`).
- [X] T009 [P] Add Node support to `HttpLambda` in `infra/common/src/http-lambda.ts`:
  - `WebLanguage = "go" | "python" | "node"`.
  - For node: runtime `lambda.Runtime.NODEJS_24_X`, handler `run.sh`, default port `3000`, and `AWS_LAMBDA_EXEC_WRAPPER: "/opt/bootstrap"` (same as python).
  - Update the doc comments.
- [X] T010 Add `nodeWebCode(appDir: string, entry = "src/server.ts")` in `infra/common/src/http-lambda.ts`. It does local bundling only, like `pythonWebCode`, with excludes `node_modules`, `dist` and `*.test.ts`:
  - Bundle with the **esbuild JavaScript API**, imported in `infra/common` (`import { buildSync } from "esbuild"`), not the `esbuild` command: the bundling runs with the app folder as working directory, and that folder has no esbuild installed. Call `buildSync({ entryPoints: [join(appDir, entry)], bundle: true, platform: "node", format: "esm", target: "node24", outfile: join(outputDir, "server.mjs"), banner: { js: 'import{createRequire}from"module";const require=createRequire(import.meta.url);' } })`.
  - Write `<out>/run.sh` as `#!/bin/bash\nexec node server.mjs\n` with mode 0755.
  - Export it from `infra/common/src/index.ts`, and add `esbuild` to `infra/common/package.json` dependencies (the version already in `pnpm-lock.yaml`).
- [X] T011 Add a `node` case to `infra/common/test/http-lambda.test.ts`: `new HttpLambda(stack, "Api", { language: "node", code: nodeWebCode(import.meta.dirname) })`. Assert `Runtime: "nodejs24.x"`, `Handler: "run.sh"`, the layer, and `PORT: "3000"` plus `AWS_LAMBDA_EXEC_WRAPPER: "/opt/bootstrap"`. Then run `pnpm --filter @bluebelle/infra-common test`.

**Checkpoint**: `just test-scripts` and the infra-common tests pass. The generator works against fake templates.

---

## Phase 3: User Story 1 - Create a new app of any kind from a template (Priority: P1) 🎯 MVP

**Goal**: `just new-go|new-py|new-web|new-ts <name>` produces a runnable app with a passing test from `templates/<kind>/app`.

**Independent Test**:
1. `just new-go demo && just new-py demo && just new-web demo && just new-ts demo`.
2. `just lint test build` passes.
3. Each backend's `/health` returns `{"status":"ok"}` (quickstart steps 1, 3 and 5).

Infra templates come in US2. Until then, keep a minimal `templates/<kind>/infra/` containing only `.gitkeep`, so the generator's existence check passes.

> ⚠️ **Interim state**: until US2 is done, every scaffold also creates an empty `infra/projects/<app>/` (just `.gitkeep`). `just infra-list` lists it and `just infra-synth` fails on it, so the Infra CI job would fail too. At the US1 checkpoint, delete all demo apps **before** committing, and don't push until US2 (T035) passes. The MVP that can be pushed is US1 + US2, both P1.

### Go app template

- [X] T012 [P] [US1] Create `templates/go/app/go.mod` (`module bluebelle/apps/__NAME__`, `go` version copied from `apps/api-go/go.mod`) and `templates/go/app/handler.go`, copied from `apps/api-go/handler.go` with `package __PKG__` and a doc comment naming `__NAME__`.
- [X] T013 [P] [US1] Create `templates/go/app/handler_test.go`, copied from `apps/api-go/handler_test.go` (table-driven: health ok, wrong method 405, not found 404) with `package __PKG__`.
- [X] T014 [P] [US1] Create `templates/go/app/cmd/__BASE__/main.go`, based on `apps/api-go/cmd/api-go/main.go`:
  - imports `__PKG__ "bluebelle/apps/__NAME__"`;
  - listens on `127.0.0.1:` plus `PORT` env, default `8080`;
  - logs `__NAME__ listening on …`.
- [X] T015 [P] [US1] Create `templates/go/app/README.md` with run and test commands (`go run ./apps/__NAME__/cmd/__BASE__`, `just test-go`).

### Python app template

- [X] T016 [P] [US1] Create `templates/py/app/pyproject.toml`, based on `apps/svc-py/pyproject.toml`:
  - `name = "__NAME__"`, description `__NAME__ service`, **no `authors`**;
  - `[project.scripts] __NAME__ = "__PKG__.main:run"`;
  - the same dependencies, dev group and build-backend.
- [X] T017 [P] [US1] Create `templates/py/app/src/__PKG__/__init__.py` (empty) and `templates/py/app/src/__PKG__/main.py`, copied from `apps/svc-py/src/svc_py/main.py` with `FastAPI(title="__NAME__")`. `run()` reads `PORT` env (default `8000`).
- [X] T018 [P] [US1] Create `templates/py/app/tests/test_health.py`, copied from `apps/svc-py/tests/test_health.py` and importing `from __PKG__.main import app`.
- [X] T019 [P] [US1] Create `templates/py/app/README.md` (`uv run __NAME__`, `just test-py`).

### Web app template

- [X] T020 [P] [US1] Copy `apps/web-react/{index.html,tsconfig.json,tsconfig.app.json,tsconfig.node.json,vite.config.ts,src/}` into `templates/web/app/`, without `dist/` or `node_modules/`.
  - Set `"name": "__NAME__"` in `templates/web/app/package.json` (otherwise copied from `apps/web-react/package.json`).
  - Set the `<title>` in `index.html` and the `<h1>` in `src/App.tsx` to `__NAME__`.
- [X] T021 [P] [US1] Make sure `templates/web/app/src/App.test.tsx` still asserts the counter behaviour, and add a `README.md` (`pnpm --filter __NAME__ dev`).

### TypeScript backend template (new kind)

- [X] T022 [P] [US1] Create `templates/ts/app/package.json` with:
  - `"name": "__NAME__"`, `private`, `"type": "module"`;
  - scripts `dev: tsx watch src/server.ts`, `start: tsx src/server.ts`, `build: tsc --noEmit`, `test: vitest run`;
  - deps `hono` and `@hono/node-server` (latest stable, at least 2 weeks old);
  - devDeps `@types/node`, `tsx`, `typescript`, `vitest` at the versions used in `infra/projects/api-go/package.json`.
- [X] T023 [P] [US1] Create `templates/ts/app/tsconfig.json`: extends `../../tsconfig.base.json`, with `lib ES2023`, `types ["node"]`, `noEmit`, `allowImportingTsExtensions` and `include ["src"]`.
- [X] T024 [P] [US1] Create `templates/ts/app/src/app.ts` (`export const app = new Hono()`, `app.get("/health", (c) => c.json({ status: "ok" }))`) and `templates/ts/app/src/server.ts`. The server calls `serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000), hostname: "127.0.0.1" })` and logs `__NAME__ listening on …`.
- [X] T025 [P] [US1] Create `templates/ts/app/src/app.test.ts` (Vitest). It checks that `await app.request("/health")` gives status 200 with JSON `{status:"ok"}`, that POST `/health` gives 404 (Hono's default for an unmatched method), and that `/nope` gives 404.
- [X] T026 [P] [US1] Create `templates/ts/app/README.md` (`pnpm --filter __NAME__ dev`, `curl localhost:3000/health`).

### Commands

- [X] T027 [US1] In `justfile`:
  - Replace the bodies of `new-go`, `new-py` and `new-web` with `node scripts/new-app.mjs <kind> {{name}}`.
  - Add `new-ts name: node scripts/new-app.mjs ts {{name}}` with a comment `# New TypeScript (Hono) backend at apps/<name>-ts + infra`.
  - Update the comments on all four to say they create the app and its infra.
- [X] T028 [US1] Validate US1: run quickstart steps 1 (app parts), 2, 3 and 5 with `demo`, check that no placeholder token remains (`grep -rE '__(NAME|BASE|PKG|PASCAL)__' apps`), then delete the demo apps **and their empty `infra/projects/<app>` folders** (quickstart step 7). Skip quickstart step 4 (infra synth) here. Commit only after `git status` shows no demo folders, and don't push before T035 (see the interim-state note above).

**Checkpoint**: all four kinds scaffold runnable, tested apps, and refusals write nothing. This is the MVP.

---

## Phase 4: User Story 2 - Get matching cloud infrastructure with every app (Priority: P1)

**Goal**: the same command also creates `infra/projects/<__NAME__>`. It is synthesizable, uses `HttpLambda` for backends and `StaticSite` for web, and has an assertion test.

**Independent Test**: after scaffolding `demo` of every kind, `for p in demo-go demo-py web-demo demo-ts; do just infra-synth $p; done` succeeds without AWS credentials, and `just test` covers the 4 new stack tests (quickstart step 4).

### Shared infra scaffold files (same in every kind)

- [X] T029 [US2] Create `templates/go/infra/{package.json,cdk.json,tsconfig.json,bin/app.ts}` by turning the strings in `infra/scripts/new-project.mjs` into files:
  - `"name": "infra-__NAME__"`;
  - `bin/app.ts` calls `createProjectApp("__NAME__")` and `new __PASCAL__Stack(app, stackName(), { env, stage })`;
  - `tsconfig.json` `extends` is `../../../tsconfig.base.json`.
  
  Remove the `.gitkeep`.
- [X] T030 [US2] Copy the four files from T029 into `templates/py/infra/`, `templates/web/infra/` and `templates/ts/infra/`, and remove their `.gitkeep` files. The web copy's `package.json` adds `"prepare-app": "pnpm --filter __NAME__ build"`.

### Per-kind stacks and tests

- [X] T031 [P] [US2] Create `templates/go/infra/lib/stack.ts`, copied from `infra/projects/api-go/lib/stack.ts`:
  - class `__PASCAL__Stack`;
  - `appDir = join(import.meta.dirname, "../../../../apps/__NAME__")`;
  - `goWebCode(appDir, "./cmd/__BASE__")`;
  - `readinessPath: "/health"`.
  
  Also create `templates/go/infra/test/stack.test.ts`, copied from `infra/projects/api-go/test/stack.test.ts`, asserting `provided.al2023`, readiness `/health`, tag `App=__NAME__` and 1 HTTP API.
- [X] T032 [P] [US2] Create `templates/py/infra/lib/stack.ts` (`HttpLambda` with `language: "python"`, `pythonWebCode(appDir, "__PKG__.main:app")`, `readinessPath: "/health"`) and `templates/py/infra/test/stack.test.ts`, modelled on `infra/projects/svc-py/test/stack.test.ts` and asserting `python3.13` plus tag `App=__NAME__`.
- [X] T033 [P] [US2] Create `templates/web/infra/lib/stack.ts`, copied from `infra/projects/web-react/lib/stack.ts`, with `distDir` defaulting to `../../../../apps/__NAME__/dist`. Also create `templates/web/infra/test/stack.test.ts`, modelled on `infra/projects/web-react/test/stack.test.ts` and using a temp dist dir.
- [X] T034 [P] [US2] Create `templates/ts/infra/lib/stack.ts` (`HttpLambda` with `language: "node"`, `nodeWebCode(appDir)`, `readinessPath: "/health"`) and `templates/ts/infra/test/stack.test.ts`, asserting `Runtime: "nodejs24.x"`, `Handler: "run.sh"`, tag `App=__NAME__` and 1 HTTP API.
- [X] T035 [US2] Validate US2: scaffold `demo` of every kind, run `just test` and the 4 `just infra-synth` commands (quickstart step 4), then clean up (step 7).

**Checkpoint**: every scaffold is an app plus an independently deployable infra project.

---

## Phase 5: User Story 3 - Maintain templates in one place (Priority: P2)

**Goal**: templates are the single source, and CI catches a broken template.

**Independent Test**: break a template on purpose (for example a syntax error in `templates/ts/app/src/app.ts`) on a scratch branch. `CI=true just test-templates` fails and names `ts`. Revert, and it passes.

- [X] T036 [US3] Add a `test-templates` recipe to `justfile`:
  - Refuse unless `CI=true` or `FORCE=1`, with the message `edits go.work and lockfiles; run in CI or set FORCE=1`.
  - Use the deliberately long base name `a-very-long-project-name-for-checks`, so that formatting of long substituted names is checked (U1). Store it in `n`.
  - Then run `for k in go py web ts; do node scripts/new-app.mjs $k $n || { echo "template $k failed to scaffold"; exit 1; }; done`.
  - Then run `just lint test build`, then `for p in $n-go $n-py web-$n $n-ts; do just infra-synth $p || { echo "template infra $p failed"; exit 1; }; done`.
- [X] T037 [P] [US3] Create `.github/workflows/templates.yml`. Triggers: push to main and pull_request on `templates/**`, `scripts/**`, `infra/common/**`, `justfile`, `.mise.toml` and `.github/workflows/templates.yml`. Job steps: checkout@v5, `jdx/mise-action@v3`, `pnpm install --frozen-lockfile`, `uv sync --all-packages`, `just test-templates`.
- [X] T038 [P] [US3] Add `scripts/**` to the `paths` lists in `.github/workflows/ts.yml`, and add a step `- run: just test-scripts`, so generator tests run in CI.
- [X] T039 [US3] Validate US3 locally with `FORCE=1 just test-templates` on a scratch worktree (`git worktree add /tmp/bb-tpl HEAD`). Check that it passes, that an injected error in a template makes it fail and name that kind, then remove the worktree.

**Checkpoint**: template drift is caught automatically.

---

## Phase 6: User Story 4 - Sample apps generated from the templates (Priority: P3)

**Goal**: replace the hand-written samples with template output, and add `api-ts`.

**Independent Test**: quickstart step 6. Re-scaffolding any sample into its own name produces no diff apart from `node_modules`, `dist` and `cdk.out`.

- [X] T040 [US4] Delete the samples:
  - `rm -rf apps/api-go apps/svc-py apps/web-react infra/projects/api-go infra/projects/svc-py infra/projects/web-react`;
  - `go work edit -dropuse ./apps/api-go`;
  - then `uv sync --all-packages && pnpm install`.
- [X] T041 [US4] Regenerate the samples: `just new-go api && just new-py svc && just new-web react && just new-ts api`. Expected folders: `apps/{api-go,svc-py,web-react,api-ts}` and `infra/projects/{api-go,svc-py,web-react,api-ts}`.
- [X] T042 [US4] Run `just lint test build` and `for t in $(just infra-list); do just infra-synth "$t"; done`. Commit the updated `go.work`, `uv.lock` and `pnpm-lock.yaml` along with the samples.

**Checkpoint**: the samples are real template output, and CI covers them on every run.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T043 [P] Update `README.md`:
  - the Layout block gets `templates/` and `api-ts/` (`pnpm --filter api-ts dev`);
  - "Starting a new idea" lists the four commands and says each one also creates `infra/projects/<app>`;
  - remove "apps/web-react is also the template for just new-web".
- [X] T044 [P] Update `CLAUDE.md`: the Commands section adds `just new-ts <name>`, notes that `new-*` creates app plus infra from `templates/`, and adds `just test-templates` (CI only). The Layout section adds `apps/<name>-ts` (Hono, Vitest) and `templates/<kind>/{app,infra}`.
- [X] T045 [P] Update `infra/README.md`:
  - the tree shows `api-ts/` (`apps/api-ts on Lambda + HTTP API`);
  - the common-templates table documents `nodeWebCode()` and `HttpLambda` `language: "node"`;
  - "Adding infra for a project" says that `just new-<kind>` already does this and that `just new-infra` is for app-less stacks.
- [X] T046 Amend `.specify/memory/constitution.md` with `/speckit-constitution` (MINOR → 1.3.0):
  - add a `templates/<kind>/{app,infra}` row (app and infra templates, ignored by workspaces, checked by `just test-templates`) to the layout table;
  - change the "Scaffold with …" bullet to list `just new-go|new-py|new-web|new-ts <name>`, which create the app plus infra from `templates/`;
  - update the Sync Impact Report.
- [X] T047 Run the full quickstart (`specs/002-app-templates/quickstart.md` steps 1–7) and `just lint test build`. Tick the tasks in this file. Step 8 (cloud deploy) is only done with the user's explicit approval.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)** → **Foundational (Phase 2)** → user stories.
- **US1 (Phase 3)** depends on Phase 2 (T005–T008). The TS app template doesn't need T009–T011.
- **US2 (Phase 4)** depends on US1 (the app templates must exist for synth) and on T009–T011 (node support, needed by T034).
- **US3 (Phase 5)** depends on US1 and US2, because the CI job scaffolds complete kinds.
- **US4 (Phase 6)** depends on US1 and US2. It can run before or after US3.
- **Polish (Phase 7)** comes after US4, because the docs refer to the regenerated samples and `api-ts`.

### Within phases

- T005 → T006 → T007 → T008 (all in the generator files). T009 → T010 → T011 (same source file). The two chains can run in parallel.
- In US1, the four template groups (Go T012–T015, Python T016–T019, web T020–T021, TS T022–T026) are independent and marked [P]. T027 can start once T005 is done, and T028 is last.
- In US2, T029 → T030 → (T031, T032, T033 and T034 in parallel) → T035.

## Parallel Examples

```text
# Phase 2: two independent chains
Chain A: T005 → T006 → T007 → T008   (scripts/new-app.mjs, scripts/new-app.test.mjs, justfile)
Chain B: T009 → T010 → T011          (infra/common)

# US1: one agent per kind
T012–T015 (templates/go/app) | T016–T019 (templates/py/app) | T020–T021 (templates/web/app) | T022–T026 (templates/ts/app)

# US2: per-kind stacks once the shared infra files exist
T031 (go) | T032 (py) | T033 (web) | T034 (ts)

# Polish: docs
T043 (README.md) | T044 (CLAUDE.md) | T045 (infra/README.md)
```

## Implementation Strategy

### MVP (US1 + US2, both P1)

1. Phases 1–2: the generator plus tests.
2. Phase 3: four app templates and the `just new-*` recipes. **Validate locally** with T028, but don't push yet, because the infra folders are still empty.
3. Phase 4: infra templates. **Stop and validate** with T035. This is the first state that is safe to push.

### Incremental delivery

1. MVP: every `just new-*` creates a tested app plus synthesizable infra from the templates, and the `new-web` overwrite bug is fixed.
2. Add US3: the CI template check.
3. Add US4: regenerated samples plus `api-ts`.
4. Polish: docs and the constitution amendment.

Commit after each checkpoint on `002-app-templates`, keeping `just lint test` green. Merge to `main` after T047.
