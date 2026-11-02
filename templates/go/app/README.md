# __NAME__

Go HTTP service, created from `templates/go`. Infra: `infra/projects/__NAME__`.

```sh
go run ./apps/__NAME__/cmd/__BASE__   # http://127.0.0.1:8080/health
just test-go
just infra-synth __NAME__
```
