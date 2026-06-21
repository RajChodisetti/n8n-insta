#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

printf '[test_phase2_hashtag_ranking_smoke] Hashtag ranking was merged into the single-call caption flow. Forwarding to test_phase2_caption_iteration_smoke.sh.\n'
exec "${ROOT_DIR}/scripts/test_phase2_caption_iteration_smoke.sh" "$@"
