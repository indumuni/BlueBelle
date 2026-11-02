# BlueBelle polyglot monorepo task runner. Run `just` to list recipes.

set shell := ["bash", "-euo", "pipefail", "-c"]

export AWS_PROFILE := env("AWS_PROFILE", "default")

cdk := justfile_directory() / "node_modules/.bin/cdk"

default:
    @just --list

# Install toolchain and all dependencies
setup:
    mise install
    pnpm install
    uv sync --all-packages
    go work sync

# Lint everything
lint: lint-ts lint-py lint-go

# Format everything
fmt: fmt-ts fmt-py fmt-go

# Test everything
test: test-ts test-py test-go

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

# New Go app at apps/<name>-go
new-go name:
    #!/usr/bin/env bash
    set -euo pipefail
    dir="apps/{{name}}-go"
    mkdir -p "$dir/cmd/{{name}}"
    (cd "$dir" && go mod init "bluebelle/$dir")
    printf '// Command %s is a BlueBelle playground app.\npackage main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("hello from %s")\n}\n' "{{name}}" "{{name}}" > "$dir/cmd/{{name}}/main.go"
    go work use "./$dir"
    echo "created $dir"

# New Python app at apps/<name>-py
new-py name:
    #!/usr/bin/env bash
    set -euo pipefail
    dir="apps/{{name}}-py"
    uv init --package --name "{{name}}-py" "$dir"
    rm -f "$dir/.python-version"
    sed -i.bak 's/requires-python = ">=3.[0-9]*"/requires-python = ">=3.13"/' "$dir/pyproject.toml" && rm "$dir/pyproject.toml.bak"
    mkdir -p "$dir/tests"
    uv sync --all-packages
    echo "created $dir"

# New React app at apps/web-<name> (copied from apps/web-react)
new-web name:
    #!/usr/bin/env bash
    set -euo pipefail
    dir="apps/web-{{name}}"
    test -d apps/web-react || { echo "apps/web-react template missing"; exit 1; }
    rsync -a --exclude node_modules --exclude dist apps/web-react/ "$dir/"
    sed -i.bak 's/"name": "web-react"/"name": "web-{{name}}"/' "$dir/package.json" && rm "$dir/package.json.bak"
    pnpm install
    echo "created $dir"

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
