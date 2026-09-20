#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Tiger 345 - Guarded Disposable Test DB Reset Script
# Strictly prevents accidental resets on remote, staging, dev, or production databases.
# Invariant: Target verification MUST happen BEFORE any destructive reset action,
# and BOTH verification and reset MUST target the EXACT same verified local instance.
# No bypass flags permitted.
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$REPO_ROOT"

CONFIG_FILE="$REPO_ROOT/supabase/config.toml"
if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "❌ ERROR: $CONFIG_FILE not found. Cannot determine Supabase configuration!" >&2
  exit 1
fi

# 1. Enforce local-only target from Supabase config.toml
# Extract strictly from the [db] section (do not confuse with [api] port)
CLI_PORT=$(awk '
  /^\[db\]/ { in_db = 1; next }
  /^\[/ { in_db = 0 }
  in_db && /^[[:space:]]*port[[:space:]]*=[[:space:]]*[0-9]+/ {
    match($0, /[0-9]+/)
    print substr($0, RSTART, RLENGTH)
    exit
  }
' "$CONFIG_FILE")

if [[ -z "$CLI_PORT" ]]; then
  echo "❌ ERROR: Could not extract [db].port from $CONFIG_FILE. Refusing to guess default port!" >&2
  exit 1
fi

if [[ "$CLI_PORT" != "54322" && "$CLI_PORT" != "54332" ]]; then
  echo "❌ ERROR: supabase/config.toml defines db port '$CLI_PORT'. Only ports 54322 and 54332 are permitted for isolated test environments!" >&2
  exit 1
fi

# 2. Reject if a remote Supabase project is linked (protect remote/staging/prod from supabase db reset)
if [[ -f "$REPO_ROOT/supabase/.temp/project-ref" ]]; then
  LINKED_REF=$(cat "$REPO_ROOT/supabase/.temp/project-ref" | tr -d '[:space:]')
  if [[ -n "$LINKED_REF" ]]; then
    echo "❌ ERROR: A remote Supabase project is linked (ref: $LINKED_REF). Refusing to run db reset to protect remote databases!" >&2
    exit 1
  fi
fi

TARGET_HOST="127.0.0.1"
TARGET_PORT="$CLI_PORT"
DB_NAME="postgres"
TEST_IDENTITY="${TEST_INSTANCE_IDENTITY:-tiger345_disposable_test_instance}"

# 3. Pre-reset verification on the EXACT same local instance that CLI will reset
echo "🔍 Performing pre-reset verification on $TARGET_HOST:$TARGET_PORT ($DB_NAME)..."

node -e "
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({
  host: '$TARGET_HOST',
  port: Number('$TARGET_PORT'),
  database: '$DB_NAME',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'postgres',
  connectionTimeoutMillis: 5000,
});

async function verifyTarget() {
  try {
    const client = await pool.connect();
    try {
      const checkTable = await client.query(\"SELECT to_regclass('public._test_isolation_marker') as tbl\");
      if (!checkTable.rows[0]?.tbl) {
        console.error('❌ REFUSING RESET: Target database lacks public._test_isolation_marker! It may be a developer or shared database. Aborting to protect data.');
        process.exit(1);
      }

      const markerRes = await client.query(\"SELECT id, environment, is_isolated_test_db, instance_identity FROM public._test_isolation_marker WHERE id = 'TIGER_345_TEST_ISOLATION_MARKER'\");
      if (markerRes.rows.length === 0 || !markerRes.rows[0].is_isolated_test_db) {
        console.error('❌ REFUSING RESET: Target database has invalid or missing test isolation marker!');
        process.exit(1);
      }

      const identity = markerRes.rows[0].instance_identity || '';
      const allowed = ['tiger345_disposable_test_instance', 'ci_disposable_test_instance', 'local_disposable_test_instance'];
      if (!allowed.includes(identity)) {
        console.error(\`❌ REFUSING RESET: Instance identity '\${identity}' is not recognized as an authorized disposable test instance!\`);
        process.exit(1);
      }

      console.log(\`✅ Pre-reset verified: Target is disposable test instance '\${identity}' (env=\${markerRes.rows[0].environment}).\`);
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('❌ Pre-reset check failed (cannot verify target):', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}
verifyTarget();
"

# 4. Run reset strictly targeting local environment (--local flag guarantees local container reset)
echo "🔄 Running Supabase DB reset on verified local disposable environment ($TARGET_HOST:$TARGET_PORT)..."
npx supabase db reset --local --debug=false

echo "🔒 Provisioning disposable test isolation marker on $TARGET_HOST:$TARGET_PORT..."
DISPOSABLE_TEST_PROVISION_ALLOWED=true TEST_INSTANCE_IDENTITY="$TEST_IDENTITY" PGHOST="$TARGET_HOST" PGPORT="$TARGET_PORT" node scripts/provision-test-db.mjs

echo "✅ Disposable test database reset, seeded, and isolated test marker provisioned successfully."
