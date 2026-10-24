import { z } from 'zod';

export const CONCIERGE_V2_PROTOCOL_VERSION = 'concierge-v2' as const;

const UuidSchema = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    'Invalid UUID'
  );
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
  'TURN_CANCELLED',
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
    current_unit_price_vnd: NonNegativeIntegerSchema.optional(),
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

export const ConciergeV2PageContextSchema = z.object({
  page: z.enum(['home', 'menu', 'cart', 'reservation', 'orders', 'account', 'other']),
  menu_item_id: UuidSchema.optional(),
  order_mode: z.enum(['dine_in', 'delivery']).optional(),
}).strict().refine(value => !value.menu_item_id || value.page === 'menu', 'menu_item_id requires menu page');
export type ConciergeV2PageContext = z.infer<typeof ConciergeV2PageContextSchema>;

export const ConciergeV2TurnRequestSchema = z
  .object({
    protocol_version: z.literal(CONCIERGE_V2_PROTOCOL_VERSION),
    request_id: UuidSchema,
    session: ConciergeV2SessionReferenceSchema.optional(),
    resume_session: ConciergeV2SessionReferenceSchema.optional(),
    recover_only: z.boolean().optional(),
    expected_state_version: PositiveIntegerSchema.optional(),
    page_context: ConciergeV2PageContextSchema.optional(),
    message: z.string().trim().min(1).max(2000).optional(),
    draft_operation: ConciergeV2DraftOperationSchema.optional(),
    action: z.discriminatedUnion('type', [
      z.object({ type: z.literal('open_conversation') }).strict(),
      z.object({ type: z.literal('reset_conversation') }).strict(),
      z.object({ type: z.literal('refresh_session') }).strict(),
      z.object({ type: z.literal('review_draft') }).strict(),
      z.object({ type: z.literal('accept_meal_plan'), plan_id: UuidSchema,
        suggestion_ids: z.array(UuidSchema).min(1).max(30) }).strict(),
      z.object({ type: z.literal('accept_prices'), draft_version: PositiveIntegerSchema }).strict(),
      z.object({ type: z.literal('handoff_draft'), draft_id: UuidSchema, draft_version: PositiveIntegerSchema,
        order_mode: z.enum(['dine_in', 'delivery']) }).strict(),
      z.object({ type: z.literal('answer_clarification'), choice_field: z.enum(['guests', 'appetite']),
        choice_value: z.string().min(1).max(10),
      }).strict(),
      z.object({ type: z.literal('feedback_proposal'), proposal_id: z.string().min(1).max(100),
        proposal_version: PositiveIntegerSchema,
        rating: z.enum(['perfect', 'too_much', 'too_little', 'too_expensive', 'dislike']),
      }).strict(),
    ]).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.resume_session && (value.session || (value.action && value.action.type !== 'open_conversation'))) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid first-turn recovery' });
    }
    if (value.recover_only && !value.session && !value.resume_session) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Recovery requires a session' });
    }
    if (value.action?.type === 'answer_clarification' && !(value.action.choice_field === 'guests'
      ? /^(?:[1-9]|[12][0-9]|30)$/.test(value.action.choice_value)
      : ['light', 'normal', 'heavy'].includes(value.action.choice_value))) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid clarification' });
    }
    if ([value.message, value.draft_operation, value.action].filter(Boolean).length !== 1) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'message hoặc draft_operation là bắt buộc' });
    }
    if (value.session && !value.expected_state_version) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'expected_state_version là bắt buộc cho phiên hiện có' });
    }
    if (value.action && ((value.action.type !== 'open_conversation' && !value.session) || value.message || value.draft_operation)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Hành động cần phiên hiện có và không kèm tin nhắn.' });
    }
  });
export type ConciergeV2TurnRequest = z.infer<typeof ConciergeV2TurnRequestSchema>;

const ConciergeV2HandoffLineSchema = z
  .object({
    menu_item_id: UuidSchema,
    name: z.string().trim().min(1).max(200),
    quantity: z.number().int().min(1).max(99),
    note: z.string().trim().max(250),
    price_vnd: NonNegativeIntegerSchema,
    availability: z.literal('available'),
    price_status: z.literal('current'),
    allergy_status: z.enum(['verified_safe', 'not_requested']),
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

export const ConciergeV2CardSchema = z.lazy(() => z.discriminatedUnion('type', [
  z.object({ type: z.literal('menu_item_detail'), item: ConciergeV2MenuCandidateSchema,
    description: z.string().trim().max(700).nullable() }).strict(),
  z.object({ type: z.literal('draft_suggestion'), item: ConciergeV2MenuCandidateSchema,
    suggestion_id: UuidSchema }).strict(),
  z.object({ type: z.literal('meal_plan'), plan_id: UuidSchema,
    lines: z.array(z.object({ item: ConciergeV2MenuCandidateSchema, quantity: z.number().int().min(1).max(99),
      suggestion_id: UuidSchema }).strict()).min(1).max(30),
    subtotal_min_vnd: NonNegativeIntegerSchema.optional(),
    subtotal_max_vnd: NonNegativeIntegerSchema.optional(),
    total_min_vnd: NonNegativeIntegerSchema.optional(),
    total_max_vnd: NonNegativeIntegerSchema.optional(),
    budget_status: z.enum(['within', 'conditional']).optional(),
    orderable_exact: z.boolean().optional(),
    subtotal_vnd: NonNegativeIntegerSchema, validation_status: z.enum(['PASS', 'WARNING']),
    warnings: z.array(z.string().trim().max(200)).max(3) }).strict(),
  z.object({ type: z.literal('service_link'), destination: z.enum(['cart', 'reservations', 'orders']) }).strict(),
  z.object({ type: z.literal('reservation_option'), starts_at: IsoTimestampSchema,
    guest_count: z.number().int().min(1).max(30), status: z.enum(['available', 'unavailable', 'unverified']) }).strict(),
  z.object({ type: z.literal('order_status'), order_id: UuidSchema, code: z.string().trim().min(1).max(30),
    status: z.string().trim().min(1).max(30), order_type: z.enum(['dine_in', 'delivery', 'takeaway']),
    created_at: IsoTimestampSchema }).strict(),
  z.object({ type: z.literal('saved_address'), address_id: UuidSchema, label: z.string().trim().min(1).max(50),
    address_line: z.string().trim().min(1).max(255), ward: z.string().nullable(), district: z.string().nullable(),
    province: z.string().nullable(), is_default: z.boolean() }).strict(),
]));
export type ConciergeV2Card = z.infer<typeof ConciergeV2CardSchema>;

export const ConciergeV2CompletionPayloadSchema = z
  .object({
    protocol_version: z.literal(CONCIERGE_V2_PROTOCOL_VERSION),
    request_id: UuidSchema,
    response_id: UuidSchema,
    session: ConciergeV2SessionMetadataSchema,
    phase: ConciergeV2PhaseSchema,
    message: z.string().trim().max(2000),
    cards: z.array(ConciergeV2CardSchema).max(12),
    suggested_actions: z.array(z.string().trim().min(1).max(100)).max(3).optional(),
    warnings: z.array(z.string().trim().max(500)).max(12),
    draft: ConciergeV2DraftSchema.optional(),
    handoff: ConciergeV2HandoffResultSchema.optional(),
    clarification: ConciergeV2ClarificationSchema.optional(),
  })
  .strict();

export type ConciergeV2CompletionPayload = z.infer<typeof ConciergeV2CompletionPayloadSchema>;

export const ConciergeV2ActivitySchema = z.enum(['thinking', 'checking_menu', 'checking_info']);
export type ConciergeV2Activity = z.infer<typeof ConciergeV2ActivitySchema>;

const StreamIdentity = {
  stream_version: z.literal(2), request_id: UuidSchema, stream_id: UuidSchema,
  seq: PositiveIntegerSchema,
};
export const ConciergeStreamFrameSchema = z.discriminatedUnion('type', [
  z.object({ ...StreamIdentity, type: z.literal('start'), data: z.object({
    session: ConciergeV2SessionReferenceSchema,
  }).strict() }).strict(),
  z.object({ ...StreamIdentity, type: z.literal('status'), data: z.object({ phase: ConciergeV2ActivitySchema }).strict() }).strict(),
  z.object({ ...StreamIdentity, type: z.literal('text_delta'), data: z.object({
    message_id: UuidSchema, index: NonNegativeIntegerSchema, text: z.string().min(1).max(2000),
  }).strict() }).strict(),
  z.object({ ...StreamIdentity, type: z.literal('card'), data: z.object({
    message_id: UuidSchema, index: NonNegativeIntegerSchema, card: ConciergeV2CardSchema,
  }).strict() }).strict(),
  z.object({ ...StreamIdentity, type: z.literal('complete'), data: ConciergeV2CompletionPayloadSchema }).strict(),
  z.object({ ...StreamIdentity, type: z.literal('error'), data: ConciergeV2ErrorEnvelopeSchema }).strict(),
]);
export type ConciergeStreamFrame = z.infer<typeof ConciergeStreamFrameSchema>;

export const ConciergeV2SseStatusEventSchema = z.object({
  event: z.literal('status'),
  data: z.object({ phase: ConciergeV2ActivitySchema }).strict(),
}).strict();

export const ConciergeV2SseTextEventSchema = z.object({
  event: z.literal('text'),
  data: z.object({ text: z.string().min(1).max(700) }).strict(),
}).strict();

export const ConciergeV2SseErrorEventSchema = z.object({
  event: z.literal('error'),
  data: ConciergeV2ErrorEnvelopeSchema,
}).strict();

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

export const ConciergeV2FoodSafetyStateSchema = z.enum([
  'verified_safe',
  'contains_allergen',
  'cross_contact_risk',
  'allergen_unverified',
  'allergen_unknown',
  'conflict',
]);
export type ConciergeV2FoodSafetyState = z.infer<typeof ConciergeV2FoodSafetyStateSchema>;

export const ConciergeV2FoodSafetyEvaluationSchema = z
  .object({
    safety_state: ConciergeV2FoodSafetyStateSchema,
    matched_allergens: z.array(z.string().trim().max(100)).default([]),
    staff_confirmation_required: z.boolean().default(false),
    notes: z.string().trim().max(500).optional(),
    verified_at: IsoTimestampSchema.optional(),
  })
  .strict();
export type ConciergeV2FoodSafetyEvaluation = z.infer<typeof ConciergeV2FoodSafetyEvaluationSchema>;

export const ConciergeV2MenuCandidateSchema = z
  .object({
    id: UuidSchema,
    name: z.string().trim().min(1).max(120),
    price_vnd: NonNegativeIntegerSchema,
    pricing_mode: z.enum(['fixed', 'range', 'market', 'unknown']).default('fixed'),
    price_min: NonNegativeIntegerSchema.nullable().optional(),
    price_max: NonNegativeIntegerSchema.nullable().optional(),
    category_id: UuidSchema.optional(),
    category_name: z.string().trim().max(120).optional(),
    image_url: z.string().trim().max(500).nullable().optional(),
    serving_size: z.string().trim().max(120).nullable().optional(),
    meal_role: z.string().trim().max(50).optional(),
    spice_level: z.number().int().min(0).max(2).nullable().optional(),
    is_signature: z.boolean().default(false),
    is_bestseller: z.boolean().optional(),
    is_new: z.boolean().optional(),
    is_available: z.boolean().default(true),
    safety_state: ConciergeV2FoodSafetyStateSchema,
    safety_notes: z.string().trim().max(500).optional(),
    provenance: z.string().trim().max(100),
    tags: z.array(z.string().trim().max(50)).max(10).default([]),
  })
  .strict();
export type ConciergeV2MenuCandidate = z.infer<typeof ConciergeV2MenuCandidateSchema>;

export const ConciergeV2MenuRetrievalQuerySchema = z
  .object({
    query: z.string().trim().max(200).optional(),
    category_id: UuidSchema.optional(),
    order_mode: z.enum(['dine_in', 'delivery']).optional(),
    is_signature: z.boolean().optional(),
    is_bestseller: z.boolean().optional(),
    is_new: z.boolean().optional(),
    price_policy: z.enum(['orderable', 'bounded', 'discovery']).optional(),
    max_spice_level: z.number().int().min(0).max(2).optional(),
    max_budget_vnd: NonNegativeIntegerSchema.optional(),
    diversify_categories: z.boolean().optional(),
    dislikes: z.array(z.string().trim().max(120)).max(12).optional(),
    allergies: z.array(z.string().trim().max(120)).max(12).optional(),
    limit: z.number().int().min(1).max(8).default(8),
  })
  .strict();
export type ConciergeV2MenuRetrievalQuery = z.infer<typeof ConciergeV2MenuRetrievalQuerySchema>;

export const ConciergeV2MenuRetrievalResultSchema = z
  .object({
    candidates: z.array(ConciergeV2MenuCandidateSchema).min(0).max(8),
    total_matching: NonNegativeIntegerSchema,
    relaxed_filters: z.array(z.string().trim().max(100)).max(5).default([]),
    staff_confirmation_required: z.boolean().default(false),
    allergy_warning: z.string().trim().max(500).nullable().optional(),
  })
  .strict();
export type ConciergeV2MenuRetrievalResult = z.infer<typeof ConciergeV2MenuRetrievalResultSchema>;

export const ConciergeV2ToolResultSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('menu_items'),
      item_ids: z.array(UuidSchema).max(8),
      candidates: z.array(ConciergeV2MenuCandidateSchema).max(8).optional(),
    })
    .strict(),
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
    party_size_confirmed: z.boolean().optional(),
    max_spice_level: z.number().int().min(0).max(5).optional(),
    children: z.number().int().min(0).max(30),
    appetite: z.enum(['light', 'normal', 'heavy']),
    budget_vnd: NonNegativeIntegerSchema.nullable().optional(),
    budget_basis: z.enum(['total', 'per_person']).optional(),
    budget_per_person_vnd: NonNegativeIntegerSchema.optional(),
    requested_dish_count: z.number().int().min(1).max(30).optional(),
    requested_dish_count_scope: z.enum(['final_meal', 'new_additions']).optional(),
    merchandising: z.array(z.enum(['signature', 'bestseller', 'new'])).max(3).optional(),
    is_hard_budget: z.boolean(),
    preferences: z.array(z.string().trim().min(1).max(120)).max(12),
    dislikes: z.array(z.string().trim().min(1).max(120)).max(12),
    allergies: z.array(z.string().trim().min(1).max(120)).max(12),
    meal_purpose: z.string().trim().min(1).max(120).optional(),
    order_mode: z.enum(['dine_in', 'delivery']).optional(),
  })
  .strict();
export type ConciergeV2SessionConstraints = z.infer<typeof ConciergeV2SessionConstraintsSchema>;

export const ConciergeV2ContextGoalSchema = z.enum(['menu_browse', 'menu_detail', 'meal', 'reservation', 'restaurant', 'account']);
export const ConciergeV2DomainClarificationSchema = z.object({
  goal: ConciergeV2ContextGoalSchema,
  reason: z.enum(['missing_field', 'ambiguous_referent', 'stale_referent', 'invalid_value', 'allergy_correction']),
  missing_field: z.enum(['date', 'time', 'guests', 'budget', 'item', 'allergy']).optional(),
  unresolved_referent: z.string().max(120).optional(),
  source: z.literal('handler'), scope: z.literal('session'),
  state_version: PositiveIntegerSchema,
}).strict().refine(value => Boolean(value.missing_field || value.unresolved_referent), 'Clarification requires a field or referent');
export type ConciergeV2DomainClarification = z.infer<typeof ConciergeV2DomainClarificationSchema>;

export const ConciergeV2ConversationContextSchema = z.object({
  schema_version: z.literal(1),
  goal: ConciergeV2ContextGoalSchema.optional(),
  source: z.literal('structured_state'), scope: z.literal('session'),
  pending_question: ConciergeV2DomainClarificationSchema.optional(),
  reservation: z.object({ date: z.string().max(20).optional(), time: z.string().max(30).optional() }).strict().optional(),
  changed_fields: z.array(z.string().max(40)).max(8),
  rejections: z.array(z.object({ reason: z.string().max(120), source: z.literal('user'), scope: z.literal('meal') }).strict()).max(3),
  displayed: z.object({
    session_id: UuidSchema, state_version: PositiveIntegerSchema,
    page: ConciergeV2PageContextSchema.optional(),
    items: z.array(z.object({ menu_item_id: UuidSchema, suggestion_id: UuidSchema.optional() }).strict()).max(60),
  }).strict().optional(),
}).strict();
export type ConciergeV2ConversationContext = z.infer<typeof ConciergeV2ConversationContextSchema>;

// Current-meal facts remain independent of imported durable facts. Optional on
// persisted records so older sessions can be read without a database migration.
export const ConciergeV2SessionMemoryContextSchema = z.object({
  schema_version: z.literal(1), scope: z.literal('meal'), source: z.literal('user'),
  current: ConciergeV2SessionConstraintsSchema,
  owner_id: UuidSchema.optional(), epoch: NonNegativeIntegerSchema.optional(),
  behavioral_refreshed_epoch: NonNegativeIntegerSchema.optional(),
  imported: z.array(z.object({
    memory_type: z.enum(['preference', 'dislike', 'allergy']), memory_key: z.string().max(80),
    food: z.string().min(1).max(120), source: z.enum(['explicit', 'order_history']),
    scope: z.literal('personal'), confidence: z.number().int().min(0).max(100),
    observed_at: IsoTimestampSchema, expires_at: IsoTimestampSchema.nullable(),
    epoch: NonNegativeIntegerSchema,
  }).strict()).max(12),
}).strict();
export type ConciergeV2SessionMemoryContext = z.infer<typeof ConciergeV2SessionMemoryContextSchema>;

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
    cards: z.array(ConciergeV2CardSchema).max(12),
    suggested_actions: z.array(z.string().trim().min(1).max(100)).max(3).optional(),
    warnings: z.array(z.string().trim().max(500)).max(12),
    draft: ConciergeV2DraftSchema.optional(),
    handoff: ConciergeV2HandoffResultSchema.optional(),
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
    pending_suggestion_ids: z.array(UuidSchema).max(60),
    pending_items: z.array(z.object({ suggestion_id: UuidSchema, menu_item_id: UuidSchema,
      name: z.string().max(120), quantity: z.number().int().min(1).max(99),
      state_version: PositiveIntegerSchema, plan_id: UuidSchema.optional(),
      orderable_exact: z.boolean().optional() }).strict()).max(60).optional(),
    conversation_context: ConciergeV2ConversationContextSchema.optional(),
    memory_context: ConciergeV2SessionMemoryContextSchema.optional(),
    handoff: ConciergeV2HandoffResultSchema.optional(),
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

export const ConciergeV2ClaimResultSchema = z.object({
  session: ConciergeV2SessionMetadataSchema,
  transcript: z.array(ConciergeV2SessionMessageSchema).max(60),
  draft: ConciergeV2DraftSchema.nullable(),
}).strict();
export type ConciergeV2ClaimResult = z.infer<typeof ConciergeV2ClaimResultSchema>;

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

export const ConciergeV2MemoryTypeSchema = z.enum(['preference', 'dislike', 'allergy']);
export type ConciergeV2MemoryType = z.infer<typeof ConciergeV2MemoryTypeSchema>;

export const ConciergeV2MemorySourceSchema = z.enum(['explicit', 'order_history']);
export type ConciergeV2MemorySource = z.infer<typeof ConciergeV2MemorySourceSchema>;

export const ConciergeV2MemoryKeySchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+){0,15}$/).max(80);
const ConciergeV2FoodMemoryValueSchema = z.object({ food: z.string().trim().min(1).max(120) }).strict();

const ConciergeV2MemoryFactFieldsSchema = z.object({
  memory_type: ConciergeV2MemoryTypeSchema,
  memory_key: ConciergeV2MemoryKeySchema,
  value: ConciergeV2FoodMemoryValueSchema,
  source: ConciergeV2MemorySourceSchema,
  confidence: z.number().int().min(0).max(100),
  observed_at: IsoTimestampSchema,
  expires_at: IsoTimestampSchema.nullable(),
  schema_version: z.literal(1),
}).strict();
const validateMemoryExpiry = (value: z.infer<typeof ConciergeV2MemoryFactFieldsSchema>, context: z.RefinementCtx) => {
  if (value.expires_at && Date.parse(value.expires_at) <= Date.parse(value.observed_at)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'expires_at phải sau observed_at' });
  }
};
export const ConciergeV2MemoryFactInputSchema = ConciergeV2MemoryFactFieldsSchema.superRefine(validateMemoryExpiry);
export type ConciergeV2MemoryFactInput = z.infer<typeof ConciergeV2MemoryFactInputSchema>;

export const ConciergeV2MemoryFactSchema = ConciergeV2MemoryFactFieldsSchema.extend({
  id: UuidSchema,
  updated_at: IsoTimestampSchema,
}).strict().superRefine(validateMemoryExpiry);
export type ConciergeV2MemoryFact = z.infer<typeof ConciergeV2MemoryFactSchema>;

export const ConciergeV2MemorySettingsSchema = z.object({
  enabled: z.boolean(),
  consent_version: z.number().int().min(1).max(10000),
  memory_epoch: NonNegativeIntegerSchema,
  updated_at: IsoTimestampSchema.nullable(),
}).strict();
export type ConciergeV2MemorySettings = z.infer<typeof ConciergeV2MemorySettingsSchema>;

export const ConciergeV2MemorySettingsInputSchema = z.object({
  enabled: z.boolean(),
  consent_version: z.number().int().min(1).max(10000),
}).strict();
export type ConciergeV2MemorySettingsInput = z.infer<typeof ConciergeV2MemorySettingsInputSchema>;

export const ConciergeV2MemoryWriteInputSchema = z.object({
  expected_memory_epoch: NonNegativeIntegerSchema,
  fact: ConciergeV2MemoryFactInputSchema,
}).strict();
export type ConciergeV2MemoryWriteInput = z.infer<typeof ConciergeV2MemoryWriteInputSchema>;

export const ConciergeV2MemoryFactSelectorSchema = z.object({
  expected_memory_epoch: NonNegativeIntegerSchema.optional(),
  memory_type: ConciergeV2MemoryTypeSchema,
  memory_key: ConciergeV2MemoryKeySchema,
  source: ConciergeV2MemorySourceSchema,
}).strict();
export type ConciergeV2MemoryFactSelector = z.infer<typeof ConciergeV2MemoryFactSelectorSchema>;

export const ConciergeV2BehavioralMemorySelectorSchema = ConciergeV2MemoryFactSelectorSchema.pick({
  memory_type: true,
  memory_key: true,
}).strict();
export type ConciergeV2BehavioralMemorySelector = z.infer<typeof ConciergeV2BehavioralMemorySelectorSchema>;

export const ConciergeV2MemoryFailureReasonSchema = z.enum([
  'ACCOUNT_INELIGIBLE',
  'INVALID_MEMORY_FACT',
  'INVALID_MEMORY_SETTINGS',
  'MEMORY_DISABLED',
  'MEMORY_EPOCH_MISMATCH',
  'MEMORY_LIMIT_REACHED',
  'MEMORY_SUPPRESSED',
  'MEMORY_STORAGE_UNAVAILABLE',
]);
export type ConciergeV2MemoryFailureReason = z.infer<typeof ConciergeV2MemoryFailureReasonSchema>;

export const ConciergeV2MemorySettingsOperationSchema = z.union([
  z.object({ ok: z.literal(true), settings: ConciergeV2MemorySettingsSchema }).strict(),
  z.object({ ok: z.literal(false), reason: ConciergeV2MemoryFailureReasonSchema }).strict(),
]);
export type ConciergeV2MemorySettingsOperation = z.infer<typeof ConciergeV2MemorySettingsOperationSchema>;

export const ConciergeV2MemoryWriteOperationSchema = z.union([
  z.object({ ok: z.literal(true), fact: ConciergeV2MemoryFactSchema }).strict(),
  z.object({ ok: z.literal(false), reason: ConciergeV2MemoryFailureReasonSchema }).strict(),
]);
export type ConciergeV2MemoryWriteOperation = z.infer<typeof ConciergeV2MemoryWriteOperationSchema>;

export const ConciergeV2MemoryDeleteOperationSchema = z.union([
  z.object({ ok: z.literal(true), deleted: z.boolean() }).strict(),
  z.object({ ok: z.literal(false), reason: ConciergeV2MemoryFailureReasonSchema }).strict(),
]);
export type ConciergeV2MemoryDeleteOperation = z.infer<typeof ConciergeV2MemoryDeleteOperationSchema>;

export const ConciergeV2MemoryRestoreOperationSchema = z.union([
  z.object({ ok: z.literal(true), restored: z.boolean() }).strict(),
  z.object({ ok: z.literal(false), reason: ConciergeV2MemoryFailureReasonSchema }).strict(),
]);
export type ConciergeV2MemoryRestoreOperation = z.infer<typeof ConciergeV2MemoryRestoreOperationSchema>;

export interface ConciergeV2MemoryRepository {
  getSettings(): Promise<ConciergeV2MemorySettings>;
  setEnabled(input: ConciergeV2MemorySettingsInput): Promise<ConciergeV2MemorySettingsOperation>;
  listFacts(): Promise<ReadonlyArray<ConciergeV2MemoryFact>>;
  writeFact(input: ConciergeV2MemoryWriteInput): Promise<ConciergeV2MemoryWriteOperation>;
  deleteFact(input: ConciergeV2MemoryFactSelector): Promise<ConciergeV2MemoryDeleteOperation>;
  forgetAll(): Promise<ConciergeV2MemorySettingsOperation>;
  restoreBehavioralFact(input: ConciergeV2BehavioralMemorySelector): Promise<ConciergeV2MemoryRestoreOperation>;
}

export const ConciergeV2ExtractedFactCandidateSchema = z.object({
  memory_type: ConciergeV2MemoryTypeSchema,
  memory_key: ConciergeV2MemoryKeySchema,
  food: z.string().trim().min(1).max(120),
  confidence: z.number().int().min(0).max(100),
  is_correction: z.boolean().default(false),
  target_memory_key: ConciergeV2MemoryKeySchema.optional(),
}).strict();
export type ConciergeV2ExtractedFactCandidate = z.infer<typeof ConciergeV2ExtractedFactCandidateSchema>;

export const ConciergeV2ExtractionResultSchema = z.object({
  extracted: z.boolean(),
  facts: z.array(ConciergeV2ExtractedFactCandidateSchema).max(3),
  rejection_reason: z.string().nullable().default(null),
}).strict();
export type ConciergeV2ExtractionResult = z.infer<typeof ConciergeV2ExtractionResultSchema>;

export const ConciergeV2BehavioralItemCandidateSchema = z.object({
  menu_item_id: UuidSchema.nullable(),
  item_name: z.string().trim().min(1).max(120),
  order_count: PositiveIntegerSchema,
  total_quantity: PositiveIntegerSchema,
  last_ordered_at: IsoTimestampSchema,
  confidence: z.number().int().min(0).max(100),
}).strict();
export type ConciergeV2BehavioralItemCandidate = z.infer<typeof ConciergeV2BehavioralItemCandidateSchema>;

export const ConciergeV2BehavioralAggregationResultSchema = z.object({
  user_id: UuidSchema,
  eligible_orders_count: NonNegativeIntegerSchema,
  candidates: z.array(ConciergeV2BehavioralItemCandidateSchema).max(20),
  persisted_facts_count: NonNegativeIntegerSchema,
  suppressed_facts_count: NonNegativeIntegerSchema,
}).strict();
export type ConciergeV2BehavioralAggregationResult = z.infer<typeof ConciergeV2BehavioralAggregationResultSchema>;

export const ConciergeV2RetrievedMemoryFactSchema = z.object({
  memory_type: ConciergeV2MemoryTypeSchema,
  memory_key: ConciergeV2MemoryKeySchema,
  food: z.string().trim().min(1).max(120),
  source: ConciergeV2MemorySourceSchema,
  confidence: z.number().int().min(0).max(100),
  observed_at: IsoTimestampSchema.optional(),
  expires_at: IsoTimestampSchema.nullable().optional(),
  epoch: NonNegativeIntegerSchema.optional(),
}).strict();
export type ConciergeV2RetrievedMemoryFact = z.infer<typeof ConciergeV2RetrievedMemoryFactSchema>;

export const ConciergeV2MemoryRetrievalResultSchema = z.object({
  intent_type: z.enum(['food_or_draft', 'faq']),
  fetched_from_storage: z.boolean(),
  facts: z.array(ConciergeV2RetrievedMemoryFactSchema).max(12),
  formatted_prompt: z.string().max(2000),
  estimated_tokens: NonNegativeIntegerSchema,
}).strict();
export type ConciergeV2MemoryRetrievalResult = z.infer<typeof ConciergeV2MemoryRetrievalResultSchema>;
