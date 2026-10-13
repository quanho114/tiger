# Concierge verified streaming

Tiger uses the existing Concierge v2 request and session model. The transport
streams truthful processing status, followed by verified presentation data only
after the session CAS succeeds. This is verified presentation streaming, not
unfiltered token streaming from the model. No additional model calls are used to
produce the animation or validate stream fragments.

## Wire contract

Clients opt in with `Accept: text/event-stream` and
`X-Concierge-Stream-Version: 2`. Schemas live in
`supabase/functions/_shared/contracts/concierge-v2.ts`. Every data event contains
`stream_version`, `request_id`, `stream_id`, monotonic `seq`, `type`, and typed
`data`. Event names must match `type`.

Order: `start`, zero or more `status`, verified `text_delta`, verified `card`,
then exactly one `complete`. An `error` may terminate an unfinished turn instead.
An early failure can emit `error` without `start`. SSE comments are heartbeat
messages and do not participate in sequence numbering.

`start` carries a session reference for recovery, not a committed cart. Receipt
capabilities stay in tab memory; never log them or store them in browser storage.
`text_delta` contains append-only text with consecutive indices and a stable
message ID. Cards have consecutive indices. `complete` is the full canonical
completion; the parser requires all previews to agree with it. Only completion
may update session state, draft, or apply a cart handoff. An incomplete stream
never grants permission to use a proposal.

Legacy `status/text/complete/error` transport remains supported. On the updated
server even legacy text is emitted after the committed result is available.
Deploy backend/CORS changes before the new frontend. Set server-only
`CONCIERGE_STREAM_V2_DISABLED=true` to roll transport back to legacy; this does
not disable grounding, ownership checks, or checkout boundaries.

## Recovery and cancellation

The client freezes the original payload by request ID, including page context
and expected version. Retrying cannot silently change the item currently viewed
or use a fresh request ID to duplicate a mutation. Initial guest turns retain the
receipt as `resume_session`; this transport reference is not part of the logical
operation hash. Page context is part of the hash.

Idempotency records created before page context was included in the hash are not
automatically converted. Retrying such an in-flight request after a deployment
may return `IDEMPOTENCY_MISMATCH`; refresh and inspect the committed state before
starting a new operation. Do not blindly retry a mutation with a new request ID.

`recover_only` returns an already committed idempotent result and never executes
an unfinished request. Receipt ownership and capability are checked through the
existing session store. Recovery of an unknown result does not prove the original
operation was cancelled. The UI requires explicit retry of the same request, or
reset, before a different state-changing operation.

Stop aborts reception and propagates cancellation to provider fetches. The
runtime checks cancellation before entering CAS. Cancellation during/after CAS
cannot undo a committed draft or handoff; the UI attempts read-only recovery and
shows the confirmed result or an explicit unknown state. Never describe a stopped
connection as a refunded payment or rolled-back order. Existing checkout remains
manual. PostgreSQL work is cooperatively fenced before commit, not forcibly
cancelled mid-query. Cancelled empty guest sessions retain their normal TTL so
their receipt remains recoverable. Failed uncommitted new sessions are otherwise
cleaned up; committed sessions are never deleted by stream failure cleanup.

## Resource and presentation limits

Server heartbeat: 10 seconds when downstream queue permits. Turn stream deadline:
25 seconds. Client deadline: 30 seconds. Provider and tool timeouts remain bounded.
Heartbeat does not extend any deadline. The server bounds total data output to
1 MiB, drops redundant processing status under backpressure, and clears timers
on success, failure, deadline and cancellation. Result presentation has bounded
size; no database transaction waits for browser animation.

Parser bounds: 1 MiB received, 256 KiB unparsed buffer, 2048 data events and 2000
text characters. It validates UTF-8, split CRLF, identity, order, schema, canonical
text/cards and terminal events. A broken stream is cancelled and cannot apply a
completion. No `Last-Event-ID` token replay is advertised: reconnect recovers the
canonical result rather than persisting every generated token.

The UI uses one assistant bubble per logical request. Long verified text is
revealed in grapheme-safe batches every 40 ms, with adaptive catch-up. Short text,
reduced motion, and hidden tabs reveal immediately on the next presentation tick.
Prices and quantity remain atomic in cards. Scroll follows only near the bottom;
readers browsing old messages get an explicit new-content control. Screen readers
receive complete text, not an announcement per character. Interrupted turns keep
the user's original message and an explicit retry control.

## Observability and verification

`concierge_stream` reports transport version, outcome, byte count and latency to
first status/verified text. These are transport timings, not model TTFT or a claim
that the full answer was streamed before validation. Existing turn metrics retain
model calls and token usage. Cancelled provider usage may be unknown; it must not
be reported as free usage merely because no result was received.

Run server/unit checks plus PostgreSQL streaming/persistence integration and
desktop/mobile browser tests. Coverage includes CAS rejection, receipt replay,
read-only recovery, provider abort, heartbeat/deadline cleanup, malformed streams,
split Unicode, canonical mismatch, stable bubbles, reduced motion and scroll.
Live provider latency and reverse-proxy buffering require separate approved
staging checks; synthetic adapters and local browser tests do not establish them.
