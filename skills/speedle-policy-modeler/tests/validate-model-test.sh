#!/usr/bin/env bash
# Regression tests for Speedle CLI selection, including the macOS name clash.

set -euo pipefail

SKILL_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
VALIDATOR="$SKILL_ROOT/scripts/validate-model.sh"
MODEL="$SKILL_ROOT/examples/en/policies.spdl"
CASES="$SKILL_ROOT/examples/en/test-cases.json"
TMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/speedle-spctl-test.XXXXXX")
trap 'rm -rf "$TMP_DIR"' EXIT

fail() {
    echo "FAIL: $1" >&2
    if [ -f "$TMP_DIR/output.log" ]; then
        echo "--- validator output ---" >&2
        cat "$TMP_DIR/output.log" >&2
    fi
    exit 1
}

assert_output_contains() {
    grep -Fq -- "$1" "$TMP_DIR/output.log" || fail "output does not contain: $1"
}

mkdir -p "$TMP_DIR/apple-bin"
cat >"$TMP_DIR/apple-bin/spctl" <<'APPLE_SPCTL'
#!/usr/bin/env bash
printf 'apple %s\n' "$*" >>"${SPCTL_CALLS:?}"
echo 'spctl: unknown command "check"' >&2
exit 64
APPLE_SPCTL
chmod +x "$TMP_DIR/apple-bin/spctl"

cat >"$TMP_DIR/speedle-spctl" <<'SPEEDLE_SPCTL'
#!/usr/bin/env bash
printf 'speedle %s\n' "$*" >>"${SPCTL_CALLS:?}"
if [ "${1:-}" = "check" ] && [ "${2:-}" = "--help" ]; then
    echo 'Check that policies are valid SPDL and that their conditions compile.'
    exit 0
fi
exit 99
SPEEDLE_SPCTL
chmod +x "$TMP_DIR/speedle-spctl"

# A Gatekeeper-like spctl on PATH must fail before PMS/ADS resolution, with an
# actionable SPEEDLE_SPCTL message rather than a Gatekeeper or missing-PMS error.
: >"$TMP_DIR/apple-calls.log"
set +e
env PATH="$TMP_DIR/apple-bin:/usr/bin:/bin" \
    SPCTL= SPEEDLE_SPCTL= SPEEDLE_PMS= SPEEDLE_ADS= \
    SPCTL_CALLS="$TMP_DIR/apple-calls.log" \
    "$VALIDATOR" "$MODEL" "$CASES" >"$TMP_DIR/output.log" 2>&1
status=$?
set -e
[ "$status" -eq 2 ] || fail "non-Speedle spctl exited $status instead of 2"
assert_output_contains "is not Speedle's spctl"
assert_output_contains "Apple's Gatekeeper tool"
assert_output_contains "export SPEEDLE_SPCTL=/path/to/speedle-plus/bin/spctl"
grep -Fxq 'apple check --help' "$TMP_DIR/apple-calls.log" || \
    fail "the PATH spctl was not probed before rejection"
echo 'PASS: rejects a non-Speedle spctl on PATH with SPEEDLE_SPCTL guidance'

# An explicit SPEEDLE_SPCTL path overrides the non-Speedle PATH binary and is
# accepted after its help output identifies the Speedle CLI.
: >"$TMP_DIR/speedle-calls.log"
set +e
env PATH="$TMP_DIR/apple-bin:/usr/bin:/bin" \
    SPCTL= SPEEDLE_SPCTL="$TMP_DIR/speedle-spctl" \
    SPEEDLE_PMS="$TMP_DIR/missing-pms" SPEEDLE_ADS="$TMP_DIR/missing-ads" \
    SPCTL_CALLS="$TMP_DIR/speedle-calls.log" \
    "$VALIDATOR" "$MODEL" "$CASES" >"$TMP_DIR/output.log" 2>&1
status=$?
set -e
[ "$status" -eq 1 ] || fail "explicit Speedle path did not reach PMS resolution"
assert_output_contains "error: pms not found at $TMP_DIR/missing-pms"
grep -Fxq 'speedle check --help' "$TMP_DIR/speedle-calls.log" || \
    fail "SPEEDLE_SPCTL was not used for the Speedle identity check"
echo 'PASS: SPEEDLE_SPCTL overrides a non-Speedle spctl on PATH'
