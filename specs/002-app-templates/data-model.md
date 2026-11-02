# Data Model: App Templates

There is no persistent data. These are the entities the generator works with.

## Kind

| Field | Values | Rule |
|---|---|---|
| `id` | `go`, `py`, `web`, `ts` | Must match a folder in `templates/` |
| `appName(base)` | `<base>-go`, `<base>-py`, `web-<base>`, `<base>-ts` | Naming rules from the constitution |
| `pkg(base)` | go: `<base>` with dashes removed + `go`; py: `<base>` with dashes → `_` + `_py`; web/ts: unused | Must be a valid identifier in the language |
| `register` | go: `go work use`; py: `uv sync --all-packages`; all kinds: `pnpm install` | Runs after the files are written |
| `infraType` | go/py/ts: HTTP service (`HttpLambda`); web: static site (`StaticSite`) | |

## Template

| Field | Description |
|---|---|
| `kind` | The owning Kind |
| `part` | `app` or `infra` |
| `root` | `templates/<kind>/<part>/` |
| `files` | Relative paths that may contain placeholders; contents are UTF-8 text with placeholders |

Invariant: each kind has exactly one `app` template and one `infra` template (SC-004).

## Placeholder

| Token | Derived from | Example (`base = my-idea`, kind `go`) |
|---|---|---|
| `__NAME__` | `appName(base)` | `my-idea-go` |
| `__BASE__` | `base` | `my-idea` |
| `__PKG__` | `pkg(base)` | `myideago` |
| `__PASCAL__` | PascalCase of `appName` | `MyIdeaGo` |

Placeholders are replaced in both path segments and file contents.

## Scaffold Request

| Field | Validation |
|---|---|
| `kind` | One of the Kind ids, otherwise print usage and exit 2 |
| `base` | `^[a-z][a-z0-9-]*$`, and must not end with `-`, otherwise print usage and exit 2 |

## Scaffold Request lifecycle

```
requested ──validate──▶ rejected (exit 2, nothing written)
    │
    ├─ template missing ─▶ rejected (exit 1, nothing written)
    ├─ target exists ────▶ rejected (exit 1, nothing written)
    ▼
 writing ──▶ registering ──▶ created (exit 0)
                  │
                  └─ fails ─▶ partial (exit 1, prints created paths)
```

## Scaffolded App ↔ Infrastructure Project

The relationship is 1:1, and both share the name `appName`:
- App: `apps/<appName>`
- Infrastructure project: `infra/projects/<appName>`
- CDK stack: `bb-<appName>-<stage>`

The infrastructure project refers to the app by relative path (`../../../../apps/<appName>`) and to `@bluebelle/infra-common`. It never refers to another project.
