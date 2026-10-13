import type { ConciergeTurnIntent } from '../../../supabase/functions/_shared/concierge/turn-intent.ts'
import type { ConciergeV2SessionConstraints } from '../../../supabase/functions/_shared/contracts/concierge-v2.ts'

export const fixtureVersion = '2026-09-25-v1'
export const fixtureClock = new Date('2026-09-25T05:00:00.000Z')

type RouteCase = { id: string; slice: string; input: string; intent: ConciergeTurnIntent; pending?: boolean }
type StateTurn = { input: string; intent?: ConciergeTurnIntent }
type StateCase = { id: string; turns: StateTurn[]; expected: Partial<ConciergeV2SessionConstraints> }
type KnowledgeCase = { id: string; query: string; documentId: string | null }

export const routeCases: RouteCase[] = [
  { id: 'R01', slice: 'chat', input: 'Chào bạn', intent: 'greeting' },
  { id: 'R02', slice: 'chat', input: 'xin chào', intent: 'greeting' },
  { id: 'R03', slice: 'chat', input: 'Hello', intent: 'greeting' },
  { id: 'R04', slice: 'chat', input: 'alo', intent: 'greeting' },
  { id: 'R05', slice: 'chat', input: 'bạn là ai?', intent: 'identity' },
  { id: 'R06', slice: 'chat', input: 'bạn làm được gì?', intent: 'identity' },
  { id: 'R07', slice: 'chat', input: 'cảm ơn bạn', intent: 'thanks' },
  { id: 'R08', slice: 'chat', input: 'tạm biệt', intent: 'farewell' },
  { id: 'R09', slice: 'chat', input: 'thời tiết hôm nay?', intent: 'other' },
  { id: 'R10', slice: 'chat', input: 'kể chuyện vui', intent: 'other' },
  { id: 'R11', slice: 'reservation', input: 'đặt bàn tối nay', intent: 'reservation' },
  { id: 'R12', slice: 'reservation', input: 'còn bàn cho 4 người tối nay không?', intent: 'reservation' },
  { id: 'R13', slice: 'reservation', input: 'giữ chỗ 7 giờ', intent: 'reservation' },
  { id: 'R14', slice: 'reservation', input: 'kiểm tra bàn trống tối mai', intent: 'reservation' },
  { id: 'R15', slice: 'account', input: 'đơn hàng của tôi đâu?', intent: 'order_history' },
  { id: 'R16', slice: 'account', input: 'xem lịch sử đơn', intent: 'order_history' },
  { id: 'R17', slice: 'account', input: 'đặt lại đơn cũ', intent: 'order_history' },
  { id: 'R18', slice: 'account', input: 'địa chỉ đã lưu', intent: 'saved_address' },
  { id: 'R19', slice: 'account', input: 'địa chỉ giao hàng của mình', intent: 'saved_address' },
  { id: 'R20', slice: 'knowledge', input: 'mấy giờ đóng cửa?', intent: 'faq' },
  { id: 'R21', slice: 'knowledge', input: 'may gio dong cua?', intent: 'faq' },
  { id: 'R22', slice: 'knowledge', input: 'có chỗ đỗ xe không?', intent: 'faq' },
  { id: 'R23', slice: 'knowledge', input: 'địa chỉ nhà hàng ở đâu?', intent: 'faq' },
  { id: 'R24', slice: 'knowledge', input: 'có phòng riêng không?', intent: 'faq' },
  { id: 'R25', slice: 'knowledge', input: 'chính sách giao hàng thế nào?', intent: 'faq' },
  { id: 'R26', slice: 'knowledge', input: 'ship mấy ngày?', intent: 'faq' },
  { id: 'R27', slice: 'knowledge', input: 'phí giao hàng bao nhiêu?', intent: 'faq' },
  { id: 'R28', slice: 'knowledge', input: 'hotline nhà hàng?', intent: 'faq' },
  { id: 'R29', slice: 'catalog', input: 'bên mình có món bò nào?', intent: 'food' },
  { id: 'R30', slice: 'catalog', input: 'có pizza không?', intent: 'food' },
  { id: 'R31', slice: 'catalog', input: 'combo 499k còn không?', intent: 'food' },
  { id: 'R32', slice: 'catalog', input: 'bò lúc lắc bao nhiêu?', intent: 'food' },
  { id: 'R33', slice: 'catalog', input: 'món nào dưới 200k?', intent: 'food' },
  { id: 'R34', slice: 'catalog', input: 'tui dị ứng tôm', intent: 'food' },
  { id: 'R35', slice: 'catalog', input: 'có món chay không?', intent: 'food' },
  { id: 'R36', slice: 'catalog', input: 'có món nào ngon không?', intent: 'food' },
  { id: 'R37', slice: 'catalog', input: 'ăn gì giờ ta?', intent: 'food' },
  { id: 'R38', slice: 'catalog', input: 'gợi ý món không cay', intent: 'food' },
  { id: 'R39', slice: 'planning', input: '4 người 800k', intent: 'food' },
  { id: 'R40', slice: 'planning', input: '6 người, khoảng 1tr5, có hải sản và bò', intent: 'food' },
  { id: 'R41', slice: 'planning', input: '6 người có 2 bé', intent: 'food' },
  { id: 'R42', slice: 'planning', input: 'lên mâm cho nhóm', intent: 'food' },
  { id: 'R43', slice: 'followup', input: '4 người nha', intent: 'constraints' },
  { id: 'R44', slice: 'followup', input: 'khoảng 1 triệu', intent: 'constraints' },
  { id: 'R45', slice: 'followup', input: 'budget còn 700k', intent: 'constraints' },
  { id: 'R46', slice: 'followup', input: 'bỏ tôm đi', intent: 'food' },
  { id: 'R47', slice: 'followup', input: 'thay bằng món bò', intent: 'food' },
  { id: 'R48', slice: 'followup', input: 'thêm 2 phần', intent: 'food' },
  { id: 'R49', slice: 'followup', input: 'ok', intent: 'food', pending: true },
  { id: 'R50', slice: 'followup', input: 'không cay nha', intent: 'food' },
]

export const stateCases: StateCase[] = [
  { id: 'S01', turns: [{ input: '4 người nha' }, { input: 'khoảng 1 triệu' }], expected: { adults: 4, budget_vnd: 1_000_000, is_hard_budget: false } },
  { id: 'S02', turns: [{ input: '4 người 800k' }, { input: 'budget còn 700k' }], expected: { adults: 4, budget_vnd: 700_000 } },
  { id: 'S03', turns: [{ input: '6 người khoảng 1tr5' }, { input: 'tối đa 1tr2' }], expected: { adults: 6, budget_vnd: 1_200_000, is_hard_budget: true } },
  { id: 'S04', turns: [{ input: 'cho 6 người' }, { input: 'có 2 bé' }], expected: { adults: 4, children: 2 } },
  { id: 'S05', turns: [{ input: '4 người' }, { input: 'thêm bé 6 tuổi' }], expected: { adults: 4, children: 1 } },
  { id: 'S06', turns: [{ input: '4 người có 2 bé' }, { input: '2 người thôi' }], expected: { adults: 1, children: 1 } },
  { id: 'S07', turns: [{ input: 'ngân sách 1 triệu' }, { input: 'còn 800k thôi' }], expected: { budget_vnd: 800_000, is_hard_budget: true } },
  { id: 'S08', turns: [{ input: 'khoảng 800k' }, { input: 'khoảng 700k' }], expected: { budget_vnd: 700_000, is_hard_budget: false } },
  { id: 'S09', turns: [{ input: 'dưới 500k' }, { input: 'tối đa 400k' }], expected: { budget_vnd: 400_000, is_hard_budget: true } },
  { id: 'S10', turns: [{ input: 'không cay nha' }, { input: 'ăn cay được' }], expected: { max_spice_level: undefined } },
  { id: 'S11', turns: [{ input: '4 người' }, { input: 'không cay nha' }], expected: { adults: 4, max_spice_level: 0 } },
  { id: 'S12', turns: [{ input: 'tầm 900k' }, { input: 'thêm bé 5 tuổi' }], expected: { budget_vnd: 900_000, children: 1 } },
  { id: 'S13', turns: [{ input: '2 người' }, { input: 'tối đa 300k' }], expected: { adults: 2, budget_vnd: 300_000 } },
  { id: 'S14', turns: [{ input: '6 người có 2 bé' }, { input: 'ngân sách 1tr5' }], expected: { adults: 4, children: 2, budget_vnd: 1_500_000 } },
  { id: 'S15', turns: [{ input: '4 người 800k' }, { input: 'bỏ món đó đi' }], expected: { adults: 4, budget_vnd: 800_000 } },
  { id: 'S16', turns: [{ input: '3 người nha' }, { input: 'giờ mở cửa mấy giờ?' }], expected: { adults: 3 } },
]

export const knowledgeCases: KnowledgeCase[] = [
  { id: 'K01', query: 'giờ mở cửa', documentId: 'doc-001' },
  { id: 'K02', query: 'may gio dong cua', documentId: 'doc-001' },
  { id: 'K03', query: 'có phòng riêng không', documentId: 'doc-001' },
  { id: 'K04', query: 'đỗ xe ở đâu', documentId: 'doc-001' },
  { id: 'K05', query: 'chính sách giao hàng', documentId: 'doc-002' },
  { id: 'K06', query: 'ship mất bao lâu', documentId: 'doc-002' },
  { id: 'K07', query: 'đặt bàn giữ chỗ bao lâu', documentId: 'doc-003' },
  { id: 'K08', query: 'món có hạt dổi không', documentId: 'doc-004' },
  { id: 'K09', query: 'dị ứng hải sản thì sao', documentId: 'doc-005' },
  { id: 'K10', query: 'giá vàng và chứng khoán thế giới hôm nay', documentId: null },
]
