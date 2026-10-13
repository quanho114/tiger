import { z } from 'zod'

export const ConciergeMetricsSchema = z.object({
  outcome: z.enum(['completed', 'rejected', 'dependency_unavailable']),
  reason: z.enum(['NONE', 'STATE_CONFLICT', 'SESSION_EXPIRED', 'DEPENDENCY_UNAVAILABLE', 'SAFE_FAILURE']),
  latency_ms: z.number().int().nonnegative(),
  input_tokens: z.number().int().nonnegative().max(12000).default(0),
  model_calls: z.number().int().min(0).max(3).default(0),
  tool_count: z.number().int().min(0).max(6).default(0),
  reported_input_tokens: z.number().int().nonnegative().default(0),
  output_tokens: z.number().int().nonnegative().default(0),
  summary_used: z.boolean().default(false),
  context_trimmed: z.boolean().default(false),
  safety_blocks: z.number().int().nonnegative().default(0),
  draft: z.boolean().default(false), handoff: z.boolean().default(false),
}).strict()

export function emitConciergeMetric(value: z.input<typeof ConciergeMetricsSchema>, sink: (value: unknown) => void = console.info) {
  const metric = ConciergeMetricsSchema.safeParse(value)
  if (metric.success) sink({ event: 'concierge_v2_turn', ...metric.data })
}
