# __NAME__

Vite + React + TypeScript app, created from `templates/web`. Infra:
`infra/projects/__NAME__` (S3 + CloudFront).

```sh
pnpm --filter __NAME__ dev     # http://localhost:5173
pnpm --filter __NAME__ test
just infra-synth __NAME__      # builds the site first
```
