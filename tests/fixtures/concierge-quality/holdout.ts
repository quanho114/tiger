import type { ConciergeTurnIntent } from '../../../supabase/functions/_shared/concierge/turn-intent.ts'
import type { ConciergeV2SessionConstraints } from '../../../supabase/functions/_shared/contracts/concierge-v2.ts'

export const holdoutVersion = '2026-09-25-v1'

export const holdoutRoutes: { id: string; input: string; intent: ConciergeTurnIntent }[] = [
  { id: 'H-R01', input: 'Quán mở đến mấy giờ?', intent: 'faq' },
  { id: 'H-R02', input: 'phí ship bao nhiêu?', intent: 'faq' },
  { id: 'H-R03', input: 'có lasagna không?', intent: 'food' },
  { id: 'H-R04', input: 'pizza giá bao nhiêu?', intent: 'food' },
  { id: 'H-R05', input: '5 người 900k', intent: 'food' },
  { id: 'H-R06', input: '5 người nha', intent: 'constraints' },
  { id: 'H-R07', input: '2 bé', intent: 'constraints' },
  { id: 'H-R08', input: 'còn 600k thôi', intent: 'constraints' },
]

export const holdoutStates: { id: string; turns: string[]; expected: Partial<ConciergeV2SessionConstraints> }[] = [
  { id: 'H-S01', turns: ['5 người 900k', 'ngân sách còn 700k'], expected: { adults: 5, budget_vnd: 700_000, is_hard_budget: true } },
  { id: 'H-S02', turns: ['4 người', '2 bé'], expected: { adults: 2, children: 2 } },
  { id: 'H-S03', turns: ['tầm 800k', 'giá bò 200k?'], expected: { budget_vnd: 800_000 } },
  { id: 'H-S04', turns: ['không cay', 'ăn cay được'], expected: { max_spice_level: undefined } },
]

export const holdoutKnowledge: { id: string; query: string; documentId: string | null }[] = [
  { id: 'H-K01', query: 'bãi đỗ xe ô tô', documentId: 'doc-001' },
  { id: 'H-K02', query: 'quy định đặt bàn', documentId: 'doc-003' },
  { id: 'H-K03', query: 'phí ship', documentId: 'doc-002' },
  { id: 'H-K04', query: 'thông tin Bitcoin', documentId: null },
]
