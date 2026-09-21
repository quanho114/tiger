# Tiger345 Jev automation contract

This integration is a development/evaluation tool, not a production transaction executor.

## Agent workflow

1. Run `npm run jev:check` to inspect prerequisites. BLOCKED is not PASS.
2. Run `npm run test:jev` for offline regression tests; these must never call paid providers.
3. Run `npm run jev:eval` only when a live, potentially paid evaluation is authorized. Use only the runner's allowlisted scenarios and synthetic sandbox.
4. Read the sanitized JSON report. A Jev DONE decision alone does not establish success: independent assertions must pass.
5. Report missing prerequisites honestly; never silently replace Jev with a scripted browser and claim a live model pass.

## Boundaries

- Never read, print, copy, or commit credential files. Inject provider credentials through the process environment outside source control. Never expose provider keys through VITE_* variables.
- Do not connect the automation to a personal signed-in browser or an existing shared daemon. Own and clean up the isolated browser, daemon and application processes.
- Do not change the upstream Jev decision policy to hardcode a scenario's actions or typed values.
- Do not automatically retry mutations, create real orders/reservations, pay, log in as real customers, reset a database, or bypass isolation guards.
- The sandbox validates UI navigation and fixture behavior, not production Concierge model quality or real database integration. Keep those evidence categories separate.
- Customer-facing Concierge actions use existing typed application gateways. Rendering or model output must never automatically confirm an order or reservation.
- Chrome permissions and provider credentials cannot be fabricated or bypassed. Return an actionable BLOCKED result if they cannot be established safely.
- Use PI_SCRATCH_DIR (or the OS temporary directory outside the workspace) for logs, browser profiles, temporary configuration and reports. Do not commit them.
