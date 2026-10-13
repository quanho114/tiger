# User-authorized provider connectivity test

Date: 2026-09-22. The user explicitly supplied the local endpoint, credential and
model for testing and previously authorized independent V18 review.

- Endpoint: `http://localhost:20128/v1`.
- Requested model: `ag/gemini-3.8-flash-high`.
- `GET /models`: HTTP 200; exact requested model listed, owned_by `ag`.
- Nonstreaming `POST /chat/completions`, max_tokens 128: client timed out after 90 seconds.
- Streaming `POST /chat/completions`, max_tokens 1024: HTTP 200; exact `OK` response
  in 3.13 seconds, two chunks. Authentication and model inference are functional.
- Credentials were read through echo-disabled stdin into the request process
  environment. No credential was written to source, report, env file or settings DB.

A subsequent 38-file independent source review returned HTTP 200 in 171.88 seconds,
but its output was incomplete and not valid final review JSON. Reported usage was
119,918 prompt tokens and 63,972 completion tokens, including 61,439 reasoning tokens.
Do not treat that response as independent sign-off. One concrete intent-parsing
finding was reproduced by five regression tests and repaired. The tests now pass.

A smaller session review timed out at its 180-second deadline; the next batch was
cancelled. Read-only inspection of the local proxy's installed reasoning adapter
showed preset overrides take precedence over body reasoning_effort and may raise
maxOutputTokens. The explicit `(1024)` reasoning suffix completed all three source-review batches
and final reassessment on the same underlying model. Final reassessment returned
valid JSON with zero findings in 121.20 seconds (58,887 prompt and 607 completion
tokens). See [review evidence](independent-review-evidence.json). No proxy
configuration was changed.

These are connectivity and source-review calls, not the live restaurant acceptance
matrix. Real-provider product quality and production readiness remain separate gates.
