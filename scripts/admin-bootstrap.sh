#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Tiger 345 - Trusted Admin CLI Bootstrap Wrapper
# Strictly guarded to local/trusted environments.
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "${SCRIPT_DIR}/admin-bootstrap.mjs" "$@"
