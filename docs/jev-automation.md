# Isolated Jev automation

## Commands

```sh
node scripts/jev/run.mjs --check
node --test tests/jev/*.test.mjs
# Optional offline UI contract smoke; never calls a model:
JEV_OFFLINE_CHROME=/usr/bin/google-chrome node --test tests/jev/*.test.mjs
# Explicit paid opt-in, only after configuring your local process environment:
node scripts/jev/run.mjs --live --scenario menu --timeout 120
```

Package command references:

```json
{
  "jev:check": "node scripts/jev/run.mjs --check",
  "jev:eval": "node scripts/jev/run.mjs --live",
  "test:jev": "node --test tests/jev/*.test.mjs"
}
```

Never put `jev:eval` in default tests, CI, install hooks, or automatic validation.

## Setup and reports

Requires POSIX, Node compatible with Tiger's package.json, installed parent dependencies,
`uv` on PATH, the `jev-ultrafast` checkout and its lockfile, and Chrome/Chromium on PATH
(or the standard macOS Chrome application). The runner performs `uv sync --frozen`
without provider credentials and checks installed Browser Harness source for explicit
`BU_CDP_WS`, named daemon, and isolated home support. This can download dependencies,
but does not call a model.

Set `TYPESAFE_API_KEY` and `TEXT_MODEL_API_KEY` in your local launching process using
your usual secure credential manager. Do not paste keys into chat or commit them.
The upstream text helper defaults apply; optional `TEXT_MODEL` and
`TEXT_MODEL_BASE_URL` are forwarded only to the Python adapter. No `.env` file is
loaded. A missing text key returns `BLOCKED`, `executed:false`, and this guide path.
`--check` verifies presence, not credential validity, and never executes the scenario.
Its successful status is `READY`, never `PASSED`.

A mode is mandatory. Only `menu` is accepted; arbitrary goals, URLs, ports, browser
arguments, and report destinations are rejected. Timeout is 10–300 seconds (default
120), covering installation/startup/model work. The adapter has at most 12 decisions
and 12 actions; this is not a dollar-cost guarantee. There are no mutation retries.

Each invocation writes a mode-0600 `report.json` in a private directory under
`PI_SCRATCH_DIR`, or OS temp if unset. Output contains only status, counts, booleans,
setup identifiers and the report path. No model traces, screenshots, generated text,
page text, stderr, key values, or raw exception messages are retained in the report.
Exit 0 means READY/PASSED; exit 2 means BLOCKED/FAILED. `executed:true` means the paid
adapter was launched, not that a provider request necessarily completed.

Long scratch paths are supported on Linux using a parent-held directory descriptor:
`/proc/<runner-pid>/fd/<fd>/bu.sock` addresses a socket physically inside the private
scratch runtime directory. No external symlink or `/tmp` socket is created. The
descriptor remains open through child cleanup; it need not survive Python exec.
Harness currently resolves `BH_RUNTIME_DIR`, so the adapter preserves the short
alias only in its socket-path function; runtime metadata and logs retain real paths.
This requires accessible Linux procfs and the checked Harness IPC interface. Other
POSIX systems require a scratch path short enough for a 104-byte socket address;
otherwise startup returns `SOCKET_PATH_UNSUPPORTED`. Daemon exit before readiness
returns sanitized `DAEMON_EXITED` immediately, not a full startup timeout.
The optional offline suite also starts the real unpaid daemon under deliberately
deep scratch and verifies socket location and cleanup; installed Python dependencies
and `PI_SCRATCH_DIR` are required. It does not exercise model decisions.

## Safety boundary

- Always owns a new loopback Vite server with a strict dynamically selected port.
  Port collisions fail instead of attaching to another server. Vite uses no config
  file or env files; synthetic Supabase URL/anon configuration is forced.
- HTTP fixture serves only GET menu/settings envelopes matching
  `tests/e2e/catalog.spec.ts` and `src/features/catalog/api.ts`. Unknown routes and
  all mutations, including orders, reservations, auth and concierge, return 403.
- A new Chrome profile uses CDP port 0. Only its `DevToolsActivePort` supplies the
  websocket. A fresh Playwright context uses `serviceWorkers: 'block'`, HTTP origin
  filtering and `routeWebSocket` that closes every socket without connecting upstream.
  The adapter injects that context ID into Jev's `Target.createTarget`; it cannot
  silently fall back to the default context. Playwright does not choose actions.
  Browser tests create a target via CDP and verify zero canary HTTP/upgrade requests,
  no worker script fetch and no service-worker registration. This covers ordinary
  page HTTP/WebSocket/registration APIs, not all browser protocols or hostile bypasses.
- A random `BU_NAME` and private `BH_HOME` prevent connection to the user's daemon.
  The runner starts the daemon as an owned process; adapter auto-start is disabled.
  Provider credentials go only to the paid Python adapter, not Vite/Chrome/daemon.
  Python audit hooks reject `.env` and harness credential-file reads.
- Cleanup sends TERM immediately, then KILL after 250 ms regardless of CDP disconnect.
  Disconnect, fixture shutdown and directory removal share a further 2500 ms budget;
  a stalled task cannot prevent process termination. Removal is best effort when that
  budget expires. Reports remain. SIGKILL/power loss cannot run cleanup; abandoned
  directories can be removed after stopping their owned processes. This is a local
  testing boundary, not a hostile-code sandbox.

## Scenario and limits

Menu starts at `/menu`; Jev receives a fixed natural-language goal to select delivery
and show the synthetic beef dish, with no ordering/sign-in/reservation. PASS requires
DONE, at least one executed action, and fresh independent DOM checks on **the same
Jev tab**: the synthetic card must be visible and URL mode must be delivery. DONE
alone is never sufficient. Failed/stale mutations abort instead of being retried.

Only the minimal menu fixture is implemented. Concierge recommendation/cart scenarios
are intentionally not allowlisted: their workflow envelopes and state need a separate
fixture; this runner does not silently simulate concierge success. No paid live run
was performed during implementation. The offline browser smoke verifies real Tiger
rendering and the mode control, not Jev's ability to choose the action. Shared Chrome,
production Supabase, authenticated flows, Windows, and arbitrary sites are unsupported.
