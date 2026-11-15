#!/usr/bin/env bash
#
# Fork footprint: what this fork changes outside its own files.
#
# Fireworks keeps its code in files that do not exist upstream and touches
# upstream files only through small seams. This report lists every upstream
# file the fork has changed or deleted, and every file it has added outside
# its own paths, so the footprint can be reviewed whenever upstream is merged.
#
# Usage:
#   scripts/fork-footprint.sh [upstream-ref]     (default: upstream/main)
#
# The comparison runs from the merge base of the upstream ref and HEAD to the
# working tree, so uncommitted and untracked files are included. Only read-only
# git commands are used: nothing is fetched, staged, committed or checked out.
# Run `git fetch upstream` first to compare with the latest upstream.

set -euo pipefail

# Stops git from refreshing the index file on disk as a side effect of `git diff`.
export GIT_OPTIONAL_LOCKS=0

DEFAULT_UPSTREAM_REF='upstream/main'
UPSTREAM_URL='https://github.com/stackblitz-labs/bolt.diy.git'

# Path prefixes that belong to the fork. A file added under one of them is
# counted but not listed. Add a prefix here when the fork gains a new home.
FORK_PATHS='
app/lib/brand.
app/lib/gtm/
app/components/gtm/
app/components/@settings/tabs/gtm-workspace/
app/components/@settings/tabs/mcp/McpCatalog.
app/components/ui/BrandLogo.
app/components/ui/DesignSchemePresetRow.
app/lib/.server/llm/prompt-gtm.
app/lib/.server/llm/starter-context.
app/lib/.server/mcp-oauth/
app/routes/api.mcp-oauth.
app/lib/hooks/useGtmWorkspace.
app/lib/stores/gtmWorkspace.
app/lib/services/mcpRedaction.
scripts/fork-footprint.sh
'

case "${1:-}" in
  -h | --help)
    sed -n '3,16p' "$0" | sed 's/^# \{0,1\}//'
    exit 0
    ;;
esac

upstream_ref="${1:-$DEFAULT_UPSTREAM_REF}"

if ! repo_root="$(git rev-parse --show-toplevel 2>/dev/null)"; then
  echo "fork-footprint: not inside a git repository." >&2
  exit 1
fi

cd "$repo_root"

if [ "$upstream_ref" = "$DEFAULT_UPSTREAM_REF" ] && ! git remote get-url upstream >/dev/null 2>&1; then
  {
    echo "fork-footprint: this repository has no 'upstream' remote, so there is nothing to compare with."
    echo "Add it and fetch it once, then run this script again:"
    echo "  git remote add upstream $UPSTREAM_URL"
    echo "  git fetch upstream"
  } >&2
  exit 1
fi

if ! git rev-parse --verify --quiet "$upstream_ref^{commit}" >/dev/null; then
  {
    echo "fork-footprint: '$upstream_ref' is not a known commit. Fetch it first, for example:"
    echo "  git fetch upstream"
  } >&2
  exit 1
fi

if ! merge_base="$(git merge-base "$upstream_ref" HEAD 2>/dev/null)"; then
  echo "fork-footprint: '$upstream_ref' and HEAD share no history, so there is no merge base to compare from." >&2
  exit 1
fi

tab="$(printf '\t')"

# Paths upstream has changed since the merge base.
upstream_changes() {
  git -c core.quotePath=false diff --no-renames --name-only "$merge_base" "$upstream_ref" --
}

# Added and deleted line counts of the fork's changes to tracked files.
fork_line_counts() {
  git -c core.quotePath=false diff --no-renames --no-ext-diff --numstat "$merge_base" --
}

# Status and path of every file the fork changed, untracked files included, sorted by path.
fork_changes() {
  {
    git -c core.quotePath=false diff --no-renames --name-status "$merge_base" --
    git -c core.quotePath=false ls-files --others --exclude-standard | awk '{ print "A\t" $0 }'
  } | LC_ALL=C sort -t "$tab" -k 2
}

awk -F '\t' \
  -v fork_paths="$(printf '%s ' $FORK_PATHS)" \
  -v upstream_ref="$upstream_ref" \
  -v merge_base="$(git rev-parse --short "$merge_base")" '
  function fork_prefix(path,    i) {
    for (i = 1; i <= prefix_count; i++) {
      if (index(path, prefixes[i]) == 1) {
        return i
      }
    }

    return 0
  }

  BEGIN {
    prefix_count = split(fork_paths, prefixes, " ")
  }

  FILENAME == ARGV[1] {
    changed_upstream[$0] = 1
    next
  }

  FILENAME == ARGV[2] {
    added_lines[$3] = $1
    deleted_lines[$3] = $2
    next
  }

  {
    status = $1
    path = $2
    flag = (path in changed_upstream) ? "!" : " "

    if (flag == "!") {
      flagged++
    }

    if (status != "A") {
      if (added_lines[path] == "-") {
        counts = sprintf("%14s", "binary")
      } else {
        counts = sprintf("%+7d %6s", added_lines[path], "-" deleted_lines[path])
        lines_added += added_lines[path]
        lines_deleted += deleted_lines[path]
      }

      seams[++seam_count] = sprintf("  %s %s %s  %s", status, flag, counts, path)
      next
    }

    prefix = fork_prefix(path)

    if (prefix == 0) {
      outside[++outside_count] = sprintf("  A %s  %s", flag, path)
      next
    }

    own_count++
    own_per_prefix[prefix]++

    if (flag == "!") {
      own_flagged[++own_flagged_count] = sprintf("  A !  %s", path)
    }
  }

  END {
    printf "Fork footprint against %s (merge base %s, working tree included)\n\n", upstream_ref, merge_base

    printf "Upstream files changed or deleted by the fork: %d (+%d -%d lines)\n", seam_count, lines_added, lines_deleted

    for (i = 1; i <= seam_count; i++) {
      print seams[i]
    }

    printf "\nFiles added outside the fork'"'"'s own paths: %d\n", outside_count

    for (i = 1; i <= outside_count; i++) {
      print outside[i]
    }

    printf "\nFiles added inside the fork'"'"'s own paths: %d\n", own_count

    for (i = 1; i <= prefix_count; i++) {
      if (own_per_prefix[i] > 0) {
        printf "  %5d  %s\n", own_per_prefix[i], prefixes[i]
      }
    }

    for (i = 1; i <= own_flagged_count; i++) {
      print own_flagged[i]
    }

    print ""

    if (flagged > 0) {
      printf "! = %s has changed this path too since the merge base (%d in total). Check these first when you merge.\n", upstream_ref, flagged
    } else {
      printf "%s has not changed any of these paths since the merge base.\n", upstream_ref
    }
  }
' <(upstream_changes) <(fork_line_counts) <(fork_changes)
