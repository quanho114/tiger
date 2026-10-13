# Legacy Concierge cleanup and V03 rollout

## Preconditions

Apply additive migrations `20260922000002_concierge_feedback_aggregates.sql` and
`20260922000003_concierge_feature_flags.sql` before deploying the router. No production
migration, deletion, or feature activation was performed during this implementation.

`system_settings` and feedback aggregates are server-only with RLS and no anon/customer
grants. Absent feature overrides use environment defaults. V2 remains default-off.
Do not enable it for customers until V04/V09/V10/V12-V18 release gates are satisfied.

## Storage inventory

Run `inventoryConciergeRetentionRecords(pool)` and
`runConciergeRetentionCleanup(pool, { dryRun: true, batchSize: 100 })` using the approved
server maintenance entrypoint. Record counts and cutoffs only, never row content.
Dry-run counts are the full eligible population, not the next bounded batch size.

Inspect FK metadata before authorizing deletion:

```sql
SELECT conrelid::regclass AS child_table, confrelid::regclass AS parent_table,
       pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE contype = 'f'
  AND confrelid IN ('public.concierge_conversations'::regclass,
                   'public.concierge_proposals'::regclass,
                   'auth.users'::regclass);
```

Current migration effects:

- Deleting a legacy conversation cascades to its proposals and events.
- Its feedback conversation ID becomes null; older feedback text and proposal IDs
  are NOT retroactively anonymized by the new guest aggregate path.
- Deleting an auth user sets legacy conversation/proposal/feedback user IDs to null.
  Therefore the `customer_user_id IS NULL` inventory includes previously authenticated
  records whose accounts were deleted, not just originally guest conversations.
- Conversations retaining a non-null user ID are counted separately and are not
  deleted by the guest-retention policy. Their policy needs separate owner review.
- Orders, order items, reservations, tables and table visits are never cleanup targets.

## Approved cleanup only

After separate authorization and review of existing backup retention/access, run one
`runConciergeRetentionCleanup(pool, { batchSize: 100 })` batch at a time. The application
rejects non-integer, zero, negative and over-1000 batch limits. Inspect returned counts
and inventory between batches. Child rows deleted by FK cascade may exceed the parent
batch size; schedule accordingly. Stop on errors. Do not export transcripts as an audit
artifact or create new indefinite backups of them. Existing backups retain their
approved access/expiry controls; a row deletion does not erase old backups immediately.

## Fail-closed rollback

Set `CONCIERGE_V2_DISABLED=true` while keeping the V2 feature gate enabled. V2 then
returns a safe unavailable response and legacy writers remain rejected. Alternatively
disable the Concierge endpoints at the gateway. Do not simply downgrade the feature
flag to reopen legacy SQL transcript writers after a privacy-preserving rollout.
Ordinary order/reservation endpoints remain separate. Leave Redis keys to expire;
never flush a shared namespace. No business-data rollback or production cleanup is
part of a V2 kill-switch operation.
