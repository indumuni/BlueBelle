# BlueBelle polyglot monorepo task runner. Run `just` to list recipes.

set shell := ["bash", "-euo", "pipefail", "-c"]

export AWS_PROFILE := env("AWS_PROFILE", "default")

cdk := justfile_directory() / "node_modules/.bin/cdk"

default:
    @just --list

# Install toolchain and all dependencies
setup:
    git config core.hooksPath .githooks
    mise install
    pnpm install
    uv sync --all-packages
    go work sync

# Lint everything
lint: lint-ts lint-py lint-go

# Format everything
fmt: fmt-ts fmt-py fmt-go

# Test everything
test: test-ts test-py test-go test-scripts

# Build everything
build: build-ts build-go

# ---- TypeScript / React ----

lint-ts:
    pnpm biome check .

fmt-ts:
    pnpm biome check --write .

test-ts:
    pnpm -r --if-present test

build-ts:
    pnpm -r --if-present build

# Tests for repo scripts (scaffold generator)
test-scripts:
    node --test 'scripts/*.test.mjs'

# ---- Python ----

lint-py:
    uv run ruff check .
    uv run ruff format --check .

fmt-py:
    uv run ruff check --fix .
    uv run ruff format .

test-py:
    #!/usr/bin/env bash
    set -euo pipefail
    shopt -s nullglob
    dirs=(apps/*-py packages/py/*/)
    if [ ${#dirs[@]} -eq 0 ]; then echo "no python projects"; exit 0; fi
    uv run pytest "${dirs[@]}" || { rc=$?; [ $rc -eq 5 ] && echo "no tests collected" || exit $rc; }

# ---- Go ----

lint-go:
    for d in $(go list -m -f '{{{{.Dir}}'); do (cd "$d" && golangci-lint run ./...); done

fmt-go:
    for d in $(go list -m -f '{{{{.Dir}}'); do (cd "$d" && golangci-lint fmt ./...); done

test-go:
    go test $(go list -m -f '{{{{.Path}}/...')

build-go:
    for d in $(go list -m -f '{{{{.Dir}}'); do (cd "$d" && go build ./...); done

# ---- Scaffolding ----

# New Go service at apps/<name>-go + infra/projects/<name>-go (from templates/go)
new-go name:
    node scripts/new-app.mjs go {{name}}

# New Python (FastAPI) service at apps/<name>-py + infra/projects/<name>-py (from templates/py)
new-py name:
    node scripts/new-app.mjs py {{name}}

# New React app at apps/web-<name> + infra/projects/web-<name> (from templates/web)
new-web name:
    node scripts/new-app.mjs web {{name}}

# New TypeScript (Hono) backend at apps/<name>-ts + infra/projects/<name>-ts (from templates/ts)
new-ts name:
    node scripts/new-app.mjs ts {{name}}

# CI only: scaffold every kind from templates/ and check it (edits go.work and lockfiles)
test-templates:
    #!/usr/bin/env bash
    set -euo pipefail
    if [ "${CI:-}" != true ] && [ "${FORCE:-}" != 1 ]; then
      echo "test-templates edits go.work and lockfiles; run in CI or set FORCE=1"; exit 1
    fi
    n=a-very-long-project-name-for-checks   # long on purpose: checks formatting after substitution
    for k in go py web ts; do
      node scripts/new-app.mjs "$k" "$n" || { echo "template $k failed to scaffold"; exit 1; }
    done
    just lint test build
    for p in "$n-go" "$n-py" "web-$n" "$n-ts"; do
      just infra-synth "$p" || { echo "template infra $p failed"; exit 1; }
    done

# ---- Infra (AWS CDK, one app per project) ----
# <target> is "shared" or a project under infra/projects/.

# One-time per account/region: create the CDKToolkit stack
cdk-bootstrap:
    cd infra/shared && {{cdk}} bootstrap

# List infra targets
infra-list:
    @echo shared; ls infra/projects

# Scaffold infra/projects/<name> (an empty, independently deployable CDK app)
new-infra name:
    node infra/scripts/new-project.mjs {{name}}
    pnpm install

[private]
infra-cdk target stage +args:
    #!/usr/bin/env bash
    set -euo pipefail
    if [ "{{target}}" = shared ]; then dir=infra/shared; else dir="infra/projects/{{target}}"; fi
    [ -f "$dir/cdk.json" ] || { echo "no infra for '{{target}}' (see: just infra-list)"; exit 1; }
    pnpm --dir "$dir" run --if-present prepare-app
    cd "$dir" && {{cdk}} {{args}} -c stage={{stage}}

infra-synth target stage="dev": (infra-cdk target stage "synth" "--quiet")

infra-diff target stage="dev": (infra-cdk target stage "diff")

infra-deploy target stage="dev": (infra-cdk target stage "deploy" "--all")

infra-destroy target stage="dev": (infra-cdk target stage "destroy" "--all")
