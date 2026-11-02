# __NAME__

TypeScript HTTP service on [Hono](https://hono.dev), created from `templates/ts`.
Infra: `infra/projects/__NAME__` (Lambda + HTTP API).

```sh
pnpm --filter __NAME__ dev     # http://127.0.0.1:3000/health
pnpm --filter __NAME__ test
just infra-synth __NAME__
```

Unlike the Go service, a wrong method on a known path returns 404 (Hono's
default), not 405.
