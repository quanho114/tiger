# Concierge local-gateway live smoke

Date: 2026-09-25. Explicit user opt-in; one OpenAI-compatible local gateway model: `ag/gemini-3.7-flash-low`. No production database, customer content or business writes. API key was passed only via a temporary process environment and was not stored here.

## Final run

| Metric | Result |
| --- | ---: |
| Synthetic cases passed | 8/8 |
| Gateway chat requests | 9 |
| Provider-reported input tokens | 22,274 |
| Provider-reported output tokens | 267 |
| p50 model-invoking scenario latency | 5,420 ms |
| p95 model-invoking scenario latency | 8,211 ms |

Model-invoking scenarios: greeting, known-price, missing-item, group-budget and budget-revision. Operational hours, unquoted delivery fee and guest order lookup are three **deterministic** passes without a model call. Percentiles are over five scenarios, not individual request latencies. Gateway pricing was not available; token counts are **not** a USD cost estimate. The report is only a small synthetic smoke test and does not certify Vietnamese conversational quality or production readiness.

## Findings and fixes during the run

- Initial run failed five model scenarios because this gateway returns SSE by default. Explicit `stream: false` for nonstream OpenAI-compatible calls made the adapter parse its JSON response.
- Second run passed 6/8. The budget planner failed when the model supplied unsupported read-tool arguments; the backend now ignores invalid read calls and chooses its validated canonical fallback without accepting mutations. A budget correction also failed when the model echoed an unsupported numeric claim; the confirmed constraint now receives a server-owned neutral acknowledgment.
- Final isolated checks and full synthetic run passed. No provider-comparison, human rating, isolated-database workflow, checkout or reservation write test was performed. These still require the separate Q6 staging acceptance process.

Full sanitized JSON for this local run was written outside the repository at `/tmp/tiger-concierge-live-benchmark-final.json`; the temporary path is not a durable artifact. Rotate the key shared in chat after this test.
