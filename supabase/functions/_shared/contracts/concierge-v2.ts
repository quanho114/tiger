import { z } from 'zod';

export const CONCIERGE_V2_PROTOCOL_VERSION = 'concierge-v2' as const;

const UuidSchema = z.string().uuid();
const IsoTimestampSchema = z.string().datetime({ offset: true });
const PositiveIntegerSchema = z.number().int().positive();
const NonNegativeIntegerSchema = z.number().int().nonnegative();
const CapabilitySchema = z.string().regex(/^csc_[A-Za-z0-9_-]{24,256}$/);
const HandoffIdSchema = z.string().regex(/^handoff_[A-Za-z0-9_-]{16,256}$/);

export const ConciergeV2PhaseSchema = z.enum([
  'DISCOVERY',
  'PREFERENCE_COLLECTION',
  'RECOMMENDATION',
  'BUILDING_DRAFT',
  'REVIEWING',
  'HANDOFF_TO_CART',
]);
export type ConciergeV2Phase = z.infer<typeof ConciergeV2PhaseSchema>;

export const ConciergeV2ErrorCodeSchema = z.enum([
  'UNSUPPORTED_VERSION',
  'REFRESH_REQUIRED',
  'UNAUTHORIZED',
  'OWNERSHIP_MISMATCH',
  'SESSION_EXPIRED',
  'STATE_CONFLICT',
  'IDEMPOTENCY_MISMATCH',
  'DEPENDENCY_UNAVAILABLE',
  'AMBIGUOUS_ACCEPTANCE',
  'ALLERGY_UNVERIFIED',
  'PRICE_CHANGED',
  'ITEM_UNAVAILABLE',
  'INVALID_HANDOFF',
  'INTERNAL_SAFE_FAILURE',
]);
export type ConciergeV2ErrorCode = z.infer<typeof ConciergeV2ErrorCodeSchema>;

export const ConciergeV2ErrorSchema = z
  .object({
    code: ConciergeV2ErrorCodeSchema,
    message: z.string().trim().min(1).max(500),
    retryable: z.boolean().optional(),
    current_state_version: PositiveIntegerSchema.optional(),
  })
  .strict();
export type ConciergeV2Error = z.infer<typeof ConciergeV2ErrorSchema>;

export const ConciergeV2ErrorEnvelopeSchema = z
  .object({
    protocol_version: z.literal(CONCIERGE_V2_PROTOCOL_VERSION),
    request_id: UuidSchema,
    response_id: UuidSchema,
    error: ConciergeV2ErrorSchema,
  })
  .strict();
export type ConciergeV2ErrorEnvelope = z.infer<typeof ConciergeV2ErrorEnvelopeSchema>;

export const ConciergeV2SessionReferenceSchema = z
  .object({
    session_id: UuidSchema,
    session_capability: CapabilitySchema,
  })
  .strict();
export type ConciergeV2SessionReference = z.infer<typeof ConciergeV2SessionReferenceSchema>;

export const ConciergeV2SessionMetadataSchema = z
  .object({
    session_id: UuidSchema,
    session_capability: CapabilitySchema,
    state_version: PositiveIntegerSchema,
    idle_expires_at: IsoTimestampSchema,
    absolute_expires_at: IsoTimestampSchema,
  })
  .strict();
export type ConciergeV2SessionMetadata = z.infer<typeof ConciergeV2SessionMetadataSchema>;

export const ConciergeV2ActorBindingSchema = z
  .object({
    authenticated_user_id: UuidSchema.nullable(),
  })
  .strict();
export type ConciergeV2ActorBinding = z.infer<typeof ConciergeV2ActorBindingSchema>;

const ConciergeV2DraftItemSchema = z
  .object({
    line_id: UuidSchema,
    menu_item_id: UuidSchema,
    quantity: z.number().int().min(1).max(99),
    note: z.string().trim().max(250),
    unit_price_vnd: NonNegativeIntegerSchema,
  })
  .strict();
export type ConciergeV2DraftItem = z.infer<typeof ConciergeV2DraftItemSchema>;

const ConciergeV2BlockedDraftItemSchema = z
  .object({
    line_id: UuidSchema,
    menu_item_id: UuidSchema,
    reason: z.enum(['ALLERGY_UNVERIFIED', 'PRICE_CHANGED', 'ITEM_UNAVAILABLE']),
    message: z.string().trim().min(1).max(500),
  })
  .strict();
export type ConciergeV2BlockedDraftItem = z.infer<typeof ConciergeV2BlockedDraftItemSchema>;

export const ConciergeV2DraftSchema = z
  .object({
    draft_id: UuidSchema,
    version: PositiveIntegerSchema,
    review_state: z.enum(['building', 'ready_for_review', 'exported']),
    items: z.array(ConciergeV2DraftItemSchema).max(30),
    blocked_items: z.array(ConciergeV2BlockedDraftItemSchema).max(30),
    subtotal_vnd: NonNegativeIntegerSchema,
    exported_version: PositiveIntegerSchema.nullable(),
  })
  .strict();
export type ConciergeV2Draft = z.infer<typeof ConciergeV2DraftSchema>;

export const ConciergeV2DraftOperationSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('add_item'),
      pending_suggestion_id: UuidSchema,
      menu_item_id: UuidSchema,
      quantity: z.number().int().min(1).max(99),
      note: z.string().trim().max(250).default(''),
    })
    .strict(),
  z
    .object({
      type: z.literal('remove_item'),
      line_id: UuidSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('set_quantity'),
      line_id: UuidSchema,
      quantity: z.number().int().min(1).max(99),
    })
    .strict(),
  z
    .object({
      type: z.literal('start_new_set'),
    })
    .strict(),
]);
export type ConciergeV2DraftOperation = z.infer<typeof ConciergeV2DraftOperationSchema>;

export const ConciergeV2ClarificationSchema = z
  .object({
    reason: z.enum(['AMBIGUOUS_ACCEPTANCE', 'UNKNOWN_ITEM', 'UNKNOWN_QUANTITY']),
    pending_suggestion_ids: z.array(UuidSchema).min(1).max(8),
  })
  .strict();
export type ConciergeV2Clarification = z.infer<typeof ConciergeV2ClarificationSchema>;

export const ConciergeV2TurnRequestSchema = z
  .object({
    protocol_version: z.literal(CONCIERGE_V2_PROTOCOL_VERSION),
    request_id: UuidSchema,
    session: ConciergeV2SessionReferenceSchema.optional(),
    expected_state_version: PositiveIntegerSchema.optional(),
    message: z.string().trim().min(1).max(2000).optional(),
    draft_operation: ConciergeV2DraftOperationSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.message && !value.draft_operation) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'message hoặc draft_operation là bắt buộc' });
    }
    if (value.session && !value.expected_state_version) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'expected_state_version là bắt buộc cho phiên hiện có' });
    }
  });
export type ConciergeV2TurnRequest = z.infer<typeof ConciergeV2TurnRequestSchema>;

export const ConciergeV2CompletionPayloadSchema = z
  .object({
    protocol_version: z.literal(CONCIERGE_V2_PROTOCOL_VERSION),
    request_id: UuidSchema,
    response_id: UuidSchema,
    session: ConciergeV2SessionMetadataSchema,
    phase: ConciergeV2PhaseSchema,
    message: z.string().trim().max(2000),
    cards: z.array(z.unknown()).max(12),
    warnings: z.array(z.string().trim().max(500)).max(12),
    draft: ConciergeV2DraftSchema.optional(),
    clarification: ConciergeV2ClarificationSchema.optional(),
  })
  .strict();

export const ConciergeV2SseCompletionEventSchema = z
  .object({
    event: z.literal('complete'),
    data: ConciergeV2CompletionPayloadSchema,
  })
  .strict();
export type ConciergeV2SseCompletionEvent = z.infer<typeof ConciergeV2SseCompletionEventSchema>;

export const ConciergeV2CompletionEnvelopeSchema = z.union([
  ConciergeV2CompletionPayloadSchema,
  ConciergeV2SseCompletionEventSchema,
]);
export type ConciergeV2CompletionEnvelope = z.infer<typeof ConciergeV2CompletionEnvelopeSchema>;

export const ConciergeV2ResponseEnvelopeSchema = z.union([
  ConciergeV2CompletionEnvelopeSchema,
  ConciergeV2ErrorEnvelopeSchema,
]);
export type ConciergeV2ResponseEnvelope = z.infer<typeof ConciergeV2ResponseEnvelopeSchema>;

export const ConciergeV2HandoffRequestSchema = z
  .object({
    protocol_version: z.literal(CONCIERGE_V2_PROTOCOL_VERSION),
    request_id: UuidSchema,
    session: ConciergeV2SessionReferenceSchema,
    expected_state_version: PositiveIntegerSchema,
    draft_id: UuidSchema,
    draft_version: PositiveIntegerSchema,
  })
  .strict();
export type ConciergeV2HandoffRequest = z.infer<typeof ConciergeV2HandoffRequestSchema>;

const ConciergeV2HandoffLineSchema = z
  .object({
    menu_item_id: UuidSchema,
    name: z.string().trim().min(1).max(200),
    quantity: z.number().int().min(1).max(99),
    note: z.string().trim().max(250),
    price_vnd: NonNegativeIntegerSchema,
    availability: z.literal('available'),
    price_status: z.literal('current'),
    allergy_status: z.literal('verified_safe'),
  })
  .strict();

export const ConciergeV2HandoffResultSchema = z
  .object({
    handoff_id: HandoffIdSchema,
    draft_id: UuidSchema,
    draft_version: PositiveIntegerSchema,
    expires_at: IsoTimestampSchema,
    replay: z.boolean(),
    lines: z.array(ConciergeV2HandoffLineSchema).max(30),
  })
  .strict();
export type ConciergeV2HandoffResult = z.infer<typeof ConciergeV2HandoffResultSchema>;

export const ConciergeV2ToolResultSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('menu_items'), item_ids: z.array(UuidSchema).max(8) }).strict(),
  z.object({ kind: z.literal('restaurant_info'), reference_ids: z.array(UuidSchema).max(8) }).strict(),
  z.object({ kind: z.literal('clarification'), clarification: ConciergeV2ClarificationSchema }).strict(),
]);
export type ConciergeV2ToolResult = z.infer<typeof ConciergeV2ToolResultSchema>;

export const ConciergeV2ContentFreeTraceSchema = z
  .object({
    trace_id: UuidSchema,
    occurred_at: IsoTimestampSchema,
    protocol_version: z.literal(CONCIERGE_V2_PROTOCOL_VERSION),
    outcome: z.enum(['completed', 'rejected', 'dependency_unavailable', 'expired']),
    provider: z.enum(['openai', 'anthropic', 'gemini', 'stub']).optional(),
    model: z.string().trim().max(200).optional(),
    input_tokens: NonNegativeIntegerSchema.optional(),
    output_tokens: NonNegativeIntegerSchema.optional(),
    latency_ms: NonNegativeIntegerSchema.optional(),
    cost_bucket: z.enum(['none', 'low', 'medium', 'high']).optional(),
  })
  .strict();
export type ConciergeV2ContentFreeTrace = z.infer<typeof ConciergeV2ContentFreeTraceSchema>;

export const ConciergeV2SessionConstraintsSchema = z
  .object({
    adults: z.number().int().min(1).max(30),
    children: z.number().int().min(0).max(30),
    appetite: z.enum(['light', 'normal', 'heavy']),
    budget_vnd: NonNegativeIntegerSchema.nullable().optional(),
    is_hard_budget: z.boolean(),
    preferences: z.array(z.string().trim().min(1).max(120)).max(12),
    dislikes: z.array(z.string().trim().min(1).max(120)).max(12),
    allergies: z.array(z.string().trim().min(1).max(120)).max(12),
    meal_purpose: z.string().trim().min(1).max(120).optional(),
    order_mode: z.enum(['dine_in', 'delivery']).optional(),
  })
  .strict();
export type ConciergeV2SessionConstraints = z.infer<typeof ConciergeV2SessionConstraintsSchema>;

const ConciergeV2SessionMessageSchema = z
  .object({
    role: z.enum(['user', 'assistant']),
    content: z.string().trim().min(1).max(2000),
  })
  .strict();

export const ConciergeV2StoredTurnResultSchema = z
  .object({
    response_id: UuidSchema,
    phase: ConciergeV2PhaseSchema,
    message: z.string().trim().max(2000),
    cards: z.array(z.unknown()).max(12),
    warnings: z.array(z.string().trim().max(500)).max(12),
    draft: ConciergeV2DraftSchema.optional(),
    clarification: ConciergeV2ClarificationSchema.optional(),
  })
  .strict();
export type ConciergeV2StoredTurnResult = z.infer<typeof ConciergeV2StoredTurnResultSchema>;

const ConciergeV2IdempotencyRecordSchema = z
  .object({
    request_id: UuidSchema,
    operation_hash: z.string().regex(/^[a-f0-9]{64}$/),
    result: ConciergeV2StoredTurnResultSchema,
  })
  .strict();

export const ConciergeV2SessionMutableStateSchema = z
  .object({
    transcript: z.array(ConciergeV2SessionMessageSchema).max(60),
    summary: z.string().trim().max(2400),
    constraints: ConciergeV2SessionConstraintsSchema,
    draft: ConciergeV2DraftSchema.nullable(),
    pending_suggestion_ids: z.array(UuidSchema).max(8),
  })
  .strict();
export type ConciergeV2SessionMutableState = z.infer<typeof ConciergeV2SessionMutableStateSchema>;

export const ConciergeV2SessionRecordSchema = z
  .object({
    session_id: UuidSchema,
    capability_hash: z.string().regex(/^[a-f0-9]{64}$/),
    state_version: PositiveIntegerSchema,
    actor: ConciergeV2ActorBindingSchema,
    created_at: IsoTimestampSchema,
    idle_expires_at: IsoTimestampSchema,
    absolute_expires_at: IsoTimestampSchema,
    ...ConciergeV2SessionMutableStateSchema.shape,
    idempotency: z.array(ConciergeV2IdempotencyRecordSchema).max(32),
  })
  .strict();
export type ConciergeV2SessionRecord = z.infer<typeof ConciergeV2SessionRecordSchema>;

export const ConciergeV2SessionCreateInputSchema = z
  .object({
    actor: ConciergeV2ActorBindingSchema,
    ...ConciergeV2SessionMutableStateSchema.shape,
  })
  .strict();
export type ConciergeV2SessionCreateInput = z.infer<typeof ConciergeV2SessionCreateInputSchema>;

export const ConciergeV2SessionMutationInputSchema = z
  .object({
    reference: ConciergeV2SessionReferenceSchema,
    actor: ConciergeV2ActorBindingSchema,
    expected_state_version: PositiveIntegerSchema,
    request_id: UuidSchema,
    operation_hash: z.string().regex(/^[a-f0-9]{64}$/),
    next: ConciergeV2SessionMutableStateSchema,
    result: ConciergeV2StoredTurnResultSchema,
  })
  .strict();
export type ConciergeV2SessionMutationInput = z.infer<typeof ConciergeV2SessionMutationInputSchema>;

export type ConciergeV2SessionReadResult =
  | { ok: true; record: ConciergeV2SessionRecord }
  | { ok: false; error: ConciergeV2Error };

export type ConciergeV2SessionCreateResult =
  | { ok: true; record: ConciergeV2SessionRecord; reference: ConciergeV2SessionReference }
  | { ok: false; error: ConciergeV2Error };

export type ConciergeV2SessionMutationResult =
  | { ok: true; record: ConciergeV2SessionRecord; replay: boolean; result: ConciergeV2StoredTurnResult }
  | { ok: false; error: ConciergeV2Error };

export type ConciergeV2SessionDeleteResult =
  | { ok: true; deleted: true }
  | { ok: false; error: ConciergeV2Error };

export interface ConciergeV2SessionStore {
  read(reference: ConciergeV2SessionReference, actor: ConciergeV2ActorBinding): Promise<ConciergeV2SessionReadResult>;
  create(input: ConciergeV2SessionCreateInput): Promise<ConciergeV2SessionCreateResult>;
  compareAndSwap(input: ConciergeV2SessionMutationInput): Promise<ConciergeV2SessionMutationResult>;
  delete(reference: ConciergeV2SessionReference, actor: ConciergeV2ActorBinding): Promise<ConciergeV2SessionDeleteResult>;
}

export interface ConciergeV2MemoryRepository {
  getSettings(userId: string): Promise<{ enabled: boolean; memory_epoch: number } | null>;
  listFacts(userId: string): Promise<ReadonlyArray<{ id: string; key: string; source: 'explicit' | 'order_history' }>>;
  compareAndWriteFact(input: { user_id: string; expected_memory_epoch: number; key: string; value: unknown }): Promise<boolean>;
}
