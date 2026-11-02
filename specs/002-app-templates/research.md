# Research: App Templates

## R1. Where templates live, and keeping them out of tooling

- **Decision**: Use a top-level `templates/<kind>/{app,infra}`. It is not listed in `go.work`, `[tool.uv.workspace].members` or `pnpm-workspace.yaml`. Exclude it explicitly in `biome.json` (`!templates`) and ruff (`extend-exclude = ["templates"]`).
- **Rationale**: Placeholders such as `package __PKG__` are not valid code, so linting templates directly would fail. Workspace globs (`apps/*-go`, `apps/web-*` and so on) already ignore `templates/`. A CI job that scaffolds real apps from the templates validates them instead (R7).
- **Alternatives considered**:
  - Keep the templates as real, runnable apps (for example `apps/template-go`) and copy them with string rename: placeholder-free, but they would appear as apps and be renamed by fragile search-and-replace.
  - `.tmpl` suffixes on every file: noisier, and it doesn't fix path placeholders.
  - A third-party generator (cookiecutter, plop, degit): extra dependency for 4 tiny templates (VI, prefer small).

## R2. Generator implementation

- **Decision**: Use a single dependency-free Node ESM script, `scripts/new-app.mjs <kind> <name>`, called by the `just new-<kind>` recipes.
- **Rationale**: Node is already required by pnpm and CDK, and the script follows the style of `infra/scripts/new-project.mjs` (name regex, `existsSync` guard, PascalCase helper). Implementing it once gives one collision check and one set of placeholder rules.
- **Algorithm**:
  1. Validate `kind ∈ {go, py, web, ts}` and `name =~ /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/`: it starts with a letter and has single dashes between parts, with no leading, trailing or double dash. This rule keeps every derived identifier (R3) valid, and [contracts/scaffold-cli.md](./contracts/scaffold-cli.md) is the single source for it.
  2. Compute `appName`: `<name>-go`, `<name>-py`, `web-<name>` or `<name>-ts`.
  3. Check that `templates/<kind>/app` and `templates/<kind>/infra` exist, and that `apps/<appName>` and `infra/projects/<appName>` both don't.
  4. Only then, walk each template directory, substitute placeholders in paths and file contents, and write the files.
  5. Register: Go runs `go work use ./apps/<appName>`; Python runs `uv sync --all-packages`; web and TS run nothing extra. Every kind then runs `pnpm install`, because every kind has an infra project.
  6. Format the generated files with the project's formatters: `biome check --write` on the app and infra folders, plus `ruff format` and `ruff check --fix` for Python and `gofmt -w` for Go. Templates are excluded from linting (R1), so a long substituted name (for example in `__PASCAL__Stack`) could otherwise push a line past the formatter width and make `just lint` fail on a fresh app.
  7. If registration or formatting fails, print the created paths and exit non-zero, without deleting anything automatically.
- **Alternatives considered**: bash in the justfile (quoting, BSD/GNU `sed` differences, already a source of bugs); Python (uv is available, but the infra side is Node).

## R3. Placeholders

| Token | Value for `just new-go my-idea` | Value for `just new-py my-idea` | Used for |
|---|---|---|---|
| `__NAME__` | `my-idea-go` | `my-idea-py` | app and infra folder name, package `name`, module path, CDK project name |
| `__BASE__` | `my-idea` | `my-idea` | Go `cmd/<base>`, display names |
| `__PKG__` | `myideago` | `my_idea_py` | Go package (dashes removed), Python import package (dashes → `_`) |
| `__PASCAL__` | `MyIdeaGo` | `MyIdeaPy` | CDK stack class name |

- **Decision**: Use plain `__TOKEN__` string replacement in UTF-8 text files and in path segments. Copy binary files (none at present) unchanged.
- **Rationale**: The tokens can't clash with real code, are trivial to implement and are readable in templates.

## R4. TypeScript backend framework

- **Decision**: Hono 4 with `@hono/node-server`.
- **Rationale**:
  - Tiny, with no transitive dependencies.
  - Uses standard `Request`/`Response`.
  - `app.request("/health")` allows tests without a running server (IV).
  - The same `app` runs locally and on Lambda behind the Web Adapter, unchanged, mirroring the Go and Python templates.
- **Alternatives considered**:
  - Node `http`: no dependencies, but manual routing and JSON handling.
  - Fastify: heavier.
  - Express: legacy API, slower, weaker typing.

## R5. TS backend layout and build

- **Decision**:
  - `src/app.ts` exports `app`. `src/server.ts` calls `serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000), hostname: "127.0.0.1" })`.
  - Scripts:
    - `dev`: `tsx watch src/server.ts`
    - `build`: `tsc --noEmit`
    - `test`: `vitest run`
    - `start`: `tsx src/server.ts`
  - tsconfig extends `../../tsconfig.base.json`, strict.
- **Rationale**: This matches how infra packages type-check (`tsc --noEmit`). The Lambda artifact is produced by esbuild in the infra construct (R6), so the app needs no emit step.

## R6. Running Node on Lambda (`HttpLambda` node support)

- **Decision**:
  - Extend `WebLanguage` to `"go" | "python" | "node"`.
  - For node, use runtime `NODEJS_24_X` (available in aws-cdk-lib 2.275.0), handler `run.sh`, default port 3000, and `AWS_LAMBDA_EXEC_WRAPPER=/opt/bootstrap` (the same path Python uses).
  - Add `nodeWebCode(appDir, entry = "src/server.ts")`. It bundles locally with esbuild's **JavaScript API** (`buildSync` imported in `infra/common`; options `bundle`, `platform: "node"`, `format: "esm"`, `target: "node24"`, `outfile: <out>/server.mjs`, and a `createRequire` banner for CJS deps), then writes `run.sh` with `exec node server.mjs`. The command line isn't used, because bundling runs with the app folder as the working directory, where esbuild isn't installed. The API is resolved from `infra/common`'s own dependencies.
  - Add `esbuild` as an explicit dependency of `infra/common`. It is already in the lockfile through tsx and vite, and `allowBuilds.esbuild` is already set.
- **Rationale**: The same Lambda Web Adapter pattern as Go and Python, with no Docker. A single-file bundle avoids shipping `node_modules`.
- **Alternatives considered**: `aws-lambda-nodejs.NodejsFunction` (handler-style rather than an unmodified server, and it can fall back to Docker); `hono/aws-lambda` adapter (makes the Lambda code different from the local server).

## R7. Keeping templates from rotting (CI)

- **Decision**: Add `just test-templates`, which scaffolds every kind under the deliberately long name `a-very-long-project-name-for-checks` (this also catches formatting problems with long names) and runs `just lint test build` plus `just infra-synth` for each of the 4 projects. It runs only in the new workflow `.github/workflows/templates.yml`, triggered by `templates/**`, `scripts/new-app.mjs`, `infra/common/**`, `justfile` and `.mise.toml`. The recipe refuses to run locally unless `CI=true` or `FORCE=1`, because it edits `go.work` and the lockfiles.
- **Rationale**: Templates can't be linted in place (R1), so the only real proof is scaffolding and checking them. The regenerated samples give extra coverage on every normal CI run.
- **Alternatives considered**: snapshot tests of the generator output (catches changes, not breakage); scaffolding into a temp git worktree locally (slower, and complicates workspace registration).

## R8. Regenerating the samples

- **Decision**:
  - Delete `apps/{api-go,svc-py,web-react}` and `infra/projects/{api-go,svc-py,web-react}`.
  - Run `just new-go api`, `just new-py svc`, `just new-web react` and `just new-ts api`. Same names as before, plus `api-ts`.
  - Seed the templates from the current samples first, so behaviour is unchanged: Go `NewMux` plus table test, FastAPI `/health` plus `TestClient`, the React counter plus test, and the existing infra stacks and tests.
  - Drop the hard-coded `authors` from the Python template.
- **Rationale**: Proves US4 and keeps the docs, commands and CI paths that mention these names valid.

## R9. Default ports

- **Decision**: Go 8080, Python 8000, TS 3000 (both locally and as the `HttpLambda` default). Every app reads `PORT` from the environment.
- **Rationale**: These match the existing defaults. Reading `PORT` lets the Web Adapter override it.
