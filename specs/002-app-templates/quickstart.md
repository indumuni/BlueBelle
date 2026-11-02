# Quickstart: Validate App Templates

Run these checks from the repo root after `just setup`. They create throwaway `demo` apps, so run them on a scratch branch or clean up afterwards (step 7).

## 1. Scaffold one app of each kind

```sh
just new-go demo && just new-py demo && just new-web demo && just new-ts demo
```

Expected: 8 new folders, as listed in [contracts/scaffold-cli.md](./contracts/scaffold-cli.md):
- `apps/{demo-go,demo-py,web-demo,demo-ts}`
- `infra/projects/{demo-go,demo-py,web-demo,demo-ts}`

`go.work` gains `./apps/demo-go`.

```sh
grep -rE '__(NAME|BASE|PKG|PASCAL)__' apps infra/projects   # expect no output
```

## 2. Refusals write nothing

```sh
git status --porcelain > /tmp/before
just new-go demo; echo "exit=$?"        # expect "already exists", exit=1
just new-py Bad_Name; echo "exit=$?"    # expect usage, exit=2
git status --porcelain | diff /tmp/before -   # expect no diff
```

## 3. Project checks pass

```sh
just lint test build
```

## 4. Infra synthesizes without AWS credentials

```sh
for p in demo-go demo-py web-demo demo-ts; do just infra-synth "$p"; done
```

## 5. Backends answer the health check

The expected response is defined in [contracts/health.openapi.yaml](./contracts/health.openapi.yaml).

```sh
go run ./apps/demo-go/cmd/demo &            curl -s localhost:8080/health   # {"status":"ok"}
uv run demo-py &                            curl -s localhost:8000/health
pnpm --filter demo-ts start &               curl -s localhost:3000/health
```

## 6. Samples match the templates (US4)

Back up a sample, re-scaffold it under the same name, and compare:

```sh
mv apps/api-ts /tmp/api-ts.orig && mv infra/projects/api-ts /tmp/api-ts-infra.orig
just new-ts api
diff -r -x node_modules -x dist -x cdk.out /tmp/api-ts.orig apps/api-ts    # expect no diff
```

## 7. Clean up

```sh
rm -rf apps/{demo-go,demo-py,web-demo,demo-ts} infra/projects/{demo-go,demo-py,web-demo,demo-ts}
go work edit -dropuse ./apps/demo-go && uv sync --all-packages && pnpm install
just lint test build   # still green: the apps were disposable
```

## 8. Optional cloud check (only with explicit approval)

```sh
just infra-deploy api-ts     # prints the Url output
curl -s <Url>/health         # {"status":"ok"}
just infra-destroy api-ts
```
