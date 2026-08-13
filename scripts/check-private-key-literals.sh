#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -eq 0 ]]; then
  echo 'Provide at least one source path to scan.' >&2
  exit 2
fi

scan_temp_root="${RUNNER_TEMP:-${TMPDIR:-.}}"
scan_output="$(mktemp "${scan_temp_root%/}/pandora-private-key-scan.XXXXXX")"
trap 'rm -f "$scan_output"' EXIT

set +e
grep -RIl \
  --exclude='*.md' \
  --exclude='*.patch' \
  --exclude-dir='.git' \
  -e '-----BEGIN PRIVATE KEY-----' \
  -- "$@" > "$scan_output"
scan_status=$?
set -e

if [[ "$scan_status" -gt 1 ]]; then
  echo 'Private-key marker scan failed before it could produce a verdict.' >&2
  exit "$scan_status"
fi

if [[ -s "$scan_output" ]]; then
  echo 'Private-key marker found in operational source:' >&2
  sed 's/^/  /' "$scan_output" >&2
  exit 1
fi
