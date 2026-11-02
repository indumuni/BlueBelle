#!/usr/bin/env bash
# Enforces the constitution's Commit Authorship rule: commits are authored and
# committed by real people, with no AI attribution.
#   check-attribution.sh --message <file>   check a commit message (commit-msg hook)
#   check-attribution.sh --range <a..b>     check existing commits (CI)
set -euo pipefail

AI_PATTERN='claude|anthropic|noreply@anthropic\.com'
TRAILER_PATTERN="^(co-authored-by|generated-by|signed-off-by):.*(${AI_PATTERN})|generated with .*(${AI_PATTERN})"

fail() {
  echo "✗ $1" >&2
  echo "  Commits must be authored by a real person with no AI attribution (see constitution: Commit Authorship)." >&2
  exit 1
}

check_message() { # $1 = message text, $2 = label
  if grep -qiE "$TRAILER_PATTERN" <<<"$1"; then
    fail "$2: commit message contains AI attribution: $(grep -iE "$TRAILER_PATTERN" <<<"$1" | head -1)"
  fi
}

check_ident() { # $1 = "Name <email>", $2 = label
  if grep -qiE "$AI_PATTERN" <<<"$1"; then
    fail "$2: identity is not a real person: $1"
  fi
}

case "${1:-}" in
  --message)
    check_message "$(grep -v '^#' "$2")" "new commit"
    check_ident "$(git var GIT_AUTHOR_IDENT | sed 's/>.*/>/')" "author"
    check_ident "$(git var GIT_COMMITTER_IDENT | sed 's/>.*/>/')" "committer"
    ;;
  --range)
    for sha in $(git rev-list "$2"); do
      check_message "$(git log -1 --format=%B "$sha")" "$sha"
      check_ident "$(git log -1 --format='%an <%ae>' "$sha")" "$sha author"
      check_ident "$(git log -1 --format='%cn <%ce>' "$sha")" "$sha committer"
    done
    echo "✓ $(git rev-list --count "$2") commit(s) checked: authored by real people, no AI attribution"
    ;;
  *)
    echo "usage: $0 --message <file> | --range <rev-range>" >&2
    exit 2
    ;;
esac
