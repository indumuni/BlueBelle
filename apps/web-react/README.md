# web-react

Vite + React + TypeScript app, created from `templates/web`. Infra:
`infra/projects/web-react` (S3 + CloudFront).

```sh
pnpm --filter web-react dev     # http://localhost:5173
pnpm --filter web-react test
just infra-synth web-react      # builds the site first
```
