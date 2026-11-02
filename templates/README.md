# Templates

Source files for `just new-go|new-py|new-web|new-ts <name>`. Each kind has an
app template and a matching infrastructure template:

```
templates/<kind>/app/     → apps/<app>
templates/<kind>/infra/   → infra/projects/<app>
```

`scripts/new-app.mjs` copies both, replaces the placeholders below in file paths
and contents, registers the app with its workspace, installs dependencies and
formats the result. If either target folder already exists, it writes nothing.

Templates are **not** part of any workspace and are ignored by biome, ruff and
pytest, because placeholders aren't valid code. CI checks them by scaffolding a
real app of every kind (`just test-templates`).

## Placeholders

For `just new-<kind> my-idea`:

| Token | go | py | web | ts |
|---|---|---|---|---|
| `__NAME__` (app folder) | `my-idea-go` | `my-idea-py` | `web-my-idea` | `my-idea-ts` |
| `__BASE__` (name typed) | `my-idea` | `my-idea` | `my-idea` | `my-idea` |
| `__PKG__` (identifier) | `myideago` | `my_idea_py` | unused | unused |
| `__PASCAL__` (stack class) | `MyIdeaGo` | `MyIdeaPy` | `WebMyIdea` | `MyIdeaTs` |

- Go `__PKG__`: the app name with dashes removed (`my-idea-go` → `myideago`).
- Python `__PKG__`: the app name with dashes replaced by `_` (`my-idea-py` → `my_idea_py`).
- `__PASCAL__`: each dash-separated part of the app name capitalised and joined.

Names must match `^[a-z][a-z0-9]*(-[a-z0-9]+)*$`.

## Adding a kind

1. Create `templates/<kind>/app` and `templates/<kind>/infra`, using the placeholders.
2. Add the kind to `KINDS` in `scripts/new-app.mjs` (app name rule and registration steps).
3. Add a `just new-<kind>` recipe and include the kind in `just test-templates`.
