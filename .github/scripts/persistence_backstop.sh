#!/usr/bin/env bash

set -euo pipefail

artifact_root=".backstop/persistence-backstop"
comment_path="$artifact_root/comment.md"
files_root="$artifact_root/files"

mkdir -p "$artifact_root" "$files_root"

append_output() {
	local key="$1"
	local value="$2"
	printf '%s=%s\n' "$key" "$value" >>"$GITHUB_OUTPUT"
}

is_ignored_path() {
	local path="$1"
	case "$path" in
	session_*.log | .backstop/*)
		return 0
		;;
	*)
		return 1
		;;
	esac
}

append_output "triggered" "false"
append_output "artifact_dir" "$artifact_root"

event_path="${GITHUB_EVENT_PATH:-}"
event_name="${GITHUB_EVENT_NAME:-}"
repo="${GITHUB_REPOSITORY:-}"
run_id="${GITHUB_RUN_ID:-}"
run_url="https://github.com/${repo}/actions/runs/${run_id}"
initial_sha="${INITIAL_SHA:-$(git rev-parse HEAD)}"
current_sha="$(git rev-parse HEAD)"

if [[ -z "$event_path" || ! -f "$event_path" ]]; then
	exit 0
fi

issue_number="$(jq -r 'if .issue.number then .issue.number elif .pull_request.number then .pull_request.number else empty end' "$event_path")"
if [[ -z "$issue_number" || "$issue_number" == "null" ]]; then
	exit 0
fi

target_branch="bot/issue-${issue_number}"
remote_ref="origin/${target_branch}"
append_output "issue_number" "$issue_number"
append_output "target_branch" "$target_branch"
append_output "comment_path" "$comment_path"

remote_exists="false"
if git fetch origin "$target_branch" >/dev/null 2>&1; then
	remote_exists="true"
fi

status_path="$artifact_root/git-status.txt"
git status --short --untracked-files=all >"$status_path"

mapfile -t changed_paths < <(
	{
		git diff --name-only "$initial_sha" HEAD
		git diff --cached --name-only
		git diff --name-only
		git ls-files --others --exclude-standard
	} | awk 'NF' | sort -u
)

repo_changed_paths=()
for path in "${changed_paths[@]}"; do
	if is_ignored_path "$path"; then
		continue
	fi
	repo_changed_paths+=("$path")
done

dirty="false"
while IFS= read -r path; do
	[[ -z "$path" ]] && continue
	if is_ignored_path "$path"; then
		continue
	fi
	dirty="true"
	break
done < <(git status --porcelain=1 --untracked-files=all | sed -E 's/^.. //')

branch_has_changes="false"
if [[ "$remote_exists" == "true" && ${#repo_changed_paths[@]} -gt 0 ]]; then
	if git diff --quiet "$remote_ref" HEAD -- "${repo_changed_paths[@]}"; then
		branch_has_changes="true"
	fi
fi

if [[ "$dirty" == "false" ]]; then
	if [[ ${#repo_changed_paths[@]} -eq 0 ]]; then
		exit 0
	fi
	if [[ "$branch_has_changes" == "true" ]]; then
		exit 0
	fi
fi

append_output "triggered" "true"

remote_sha=""
if [[ "$remote_exists" == "true" ]]; then
	remote_sha="$(git rev-parse "$remote_ref")"
fi

printf '%s\n' "${repo_changed_paths[@]}" >"$artifact_root/changed-paths.txt"

git diff --binary >"$artifact_root/working-tree.diff" || true
git diff --binary --cached >"$artifact_root/index.diff" || true

if [[ "$remote_exists" == "true" ]]; then
	git diff --binary "$remote_ref" HEAD -- >"$artifact_root/remote-vs-head.diff" || true
	git diff --name-status "$remote_ref" HEAD -- >"$artifact_root/remote-vs-head-name-status.txt" || true
fi

if [[ "$current_sha" != "$initial_sha" ]]; then
	git format-patch --stdout "${initial_sha}..${current_sha}" >"$artifact_root/local-commits.patch" || true
fi

for path in "${repo_changed_paths[@]}"; do
	if [[ ! -e "$path" ]]; then
		continue
	fi
	mkdir -p "$files_root/$(dirname "$path")"
	cp -pR "$path" "$files_root/$path"
done

cat >"$artifact_root/metadata.json" <<EOF
{
  "event_name": "${event_name}",
  "issue_number": ${issue_number},
  "target_branch": "${target_branch}",
  "initial_sha": "${initial_sha}",
  "current_sha": "${current_sha}",
  "remote_exists": ${remote_exists},
  "remote_sha": "${remote_sha}",
  "dirty_worktree": ${dirty},
  "changed_paths_count": ${#repo_changed_paths[@]},
  "run_url": "${run_url}"
}
EOF

cat >"$comment_path" <<EOF
<!-- overseer:persistence-backstop -->

The workflow persistence backstop detected repo changes that were not verified on \`${target_branch}\`.

- Run: ${run_url}
- Initial checkout SHA: \`${initial_sha}\`
- Local HEAD after dispatcher: \`${current_sha}\`
- Remote branch head: \`${remote_sha:-missing}\`
- Dirty worktree after dispatcher: \`${dirty}\`
- Salvaged paths: \`${#repo_changed_paths[@]}\`

I saved recovery artifacts in the workflow artifact \`persistence-backstop-${run_id}\`, including diffs and file copies for any potentially lost work.
EOF
