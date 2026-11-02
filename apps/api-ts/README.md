# api-ts

TypeScript HTTP service on [Hono](https://hono.dev), created from `templates/ts`.
Infra: `infra/projects/api-ts` (Lambda + HTTP API).

```sh
pnpm --filter api-ts dev     # http://127.0.0.1:3000/health
pnpm --filter api-ts test
just infra-synth api-ts
```

Unlike the Go service, a wrong method on a known path returns 404 (Hono's
default), not 405.
