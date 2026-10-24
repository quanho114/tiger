# Bàn giao A03–A05 — 18/10/2026

**A03, A04, A05: đạt kiểm tra cục bộ. Code đã kiểm định; chatbot thực tế chưa nghiệm thu. Runtime chatbot: CHƯA KIỂM ĐỊNH.**

Không deploy, gọi provider có phí, bật memory cho khách thật hoặc sử dụng database/dữ liệu khách thật. Không commit/push, không sửa `.mcp.json`. Mọi bằng chứng model bên dưới dùng injected adapter; PostgreSQL giả lập không phải bằng chứng database thật.

## Baseline và phạm vi

- Đọc `AGENTS.md`, `Analysis/plan.md`, báo cáo A01–A02, `Conversation.md`, `Memory.md`, architecture/contributing và source/tests liên quan.
- Working tree ban đầu có A01–A02 chưa commit. Giữ chúng và xây tiếp; không reset/clean/restore repository.
- Baseline trước sửa: **115 tests / 8 files PASS** cho A01–A02, understanding, constraints, summary, context budget và memory contracts/extraction/retrieval.
- Lần chạy Vitest trong sandbox bị `spawn EPERM`; chạy lại kiểm tra cục bộ bằng quyền tạo tiến trình đã được hệ thống phê duyệt. Không mở quyền truy cập dịch vụ thật.
- Baseline file contents, `baseline.patch`, HEAD và status nằm ngoài repository tại `C:\Users\USER\Downloads\New Agent\tiger-a03-a05-baseline`.
- Đã kiểm hash: 12 file A01–A02 không cần sửa tiếp vẫn giữ nguyên từng byte so với baseline, gồm router, food/restaurant handlers, tool runner/registry, understanding engine/types/read-needs, hai suites và báo cáo A01–A02. Các file dùng chung khác được xây tiếp và regression A01–A02 vẫn qua.
- Không triển khai A00/A06–A10, benchmark 120 scenarios, retrieval/planner/style redesign, embeddings hoặc framework mới.

## Hành vi trước/sau và checklist nghiệm thu

| Gói / tình huống | Trước | Sau / bằng chứng cục bộ |
|---|---|---|
| A03 — browse | A01–A02 đã tra menu đúng mục tiêu | Tiếp tục gọi read tool ngay; không đòi số người/budget/khẩu vị |
| A03 — lập mâm thiếu số khách | Chưa có pending question theo domain | Hỏi một trường `guests`, giữ budget/nonspicy; câu trả lời số hoặc số viết bằng chữ tiếp tục recommendation |
| A03 — đặt bàn nhiều lượt | Resolve lại một message, không lưu đủ slot | Lưu ngày tuyệt đối và giờ riêng; “19h”, ngày ở lượt sau, số khách ngắn được ghép đúng; giờ mơ hồ hỏi lại |
| A03 — tham chiếu | Pending IDs có version nhưng thiếu danh sách đã hiển thị | Ordinal dùng đúng thứ tự cards, session/version/page và pending membership; hỏi rõ khi stale/ambiguous; kiểm lại catalog trước dùng |
| A03 — xác nhận mơ hồ | “để xem” có thể đi tiếp vào retrieval | Không acceptance hoặc âm thầm reject; “ok” nhiều lựa chọn hỏi rõ, rồi revalidate nguyên snapshot để nhận câu trả lời chọn món |
| A03 — câu ngoài mẫu | `other` không được cấp factual tools | Model có một cơ hội chọn public read tools; selection/gateway vẫn kiểm schema, active set và quyền; tái dùng response này để không thêm lượt model thừa |
| A04 — compaction | Summary chủ yếu draft/pending | Structured goal, pending question, changed fields, user rejection reasons và displayed IDs tồn tại độc lập summary/history |
| A04 — boundaries | Chưa có regression đủ biên | Kiểm 9/10/11 user messages, 2.499/2.500/2.501 UTF-8 bytes, giữ bốn messages, trimming và essentials overflow |
| A04 — persistence | Chưa có fields mới | Optional schemas đọc record cũ; round-trip session store và PostgreSQL adapter bằng SQL boundary giả; đã viết suite PostgreSQL thật, chưa chạy |
| A05 — provenance | Import durable facts trực tiếp vào arrays | `memory_context.current` giữ meal/group constraints; `imported` giữ nguồn/scope/thời điểm/expiry/epoch; effective arrays được tính lại |
| A05 — precedence | Khó tách nguồn khi correction/forget | Current meal preference/dislike thắng lịch sử cùng food; dislike/allergy chặn favorites; không dùng câu sửa allergy tự nhiên để bỏ bảo vệ |
| A05 — quên/tắt/xóa | Durable deletion không chứng minh session/payload sạch | Repository privacy mutations scrub toàn bộ sessions của đúng user trong cùng transaction; clear imported/history/summary/pending, giữ current meal và accepted draft |
| A05 — race/replay | Epoch chủ yếu fence durable writer | Account barrier xuyên Edge isolates bao phủ runtime read/model/CAS/postcommit/safe emission; privacy change chờ lượt đã nhận, scrub sau đó; replay giữ tombstone và không chạy lại write |
| A05 — expiry | Bản import có thể tồn tại trong session | Revalidate expiry trước model ingestion; runtime scrub expired imports trước replay; effective constraints không giữ dữ liệu hết hạn |
| A05 — refresh/identity | Refresh phụ thuộc transcript rỗng | Một lần mỗi session/epoch ở lượt food đầu tiên, kể cả sau lời chào; dùng reset CAS/delete/create hiện có; guest claim giữ current meal; UI tests kiểm logout/account switch với response đang bay |

Tests chính: `tests/server/concierge-a03.test.ts`, `concierge-a04.test.ts`, `concierge-a05.test.ts`; fixtures cùng thư mục. Các ca kiểm actual tool execution, IDs/cards, state cuối và bounded payload của injected adapter; không chấm câu trả lời bằng một chuỗi cố định.

## Contracts và khả năng suy luận

- `conversation_context` v1: structured source/session scope, goal, typed pending question (`reason`, missing field hoặc unresolved referent, state version), reservation slots, tối đa 8 changed fields, 3 user rejection reasons và 8 displayed references.
- `memory_context` v1: current meal constraints riêng, owner/epoch, behavioral refresh marker, tối đa 12 imported facts có metadata. Metadata không được sao chép toàn bộ vào model; effective constraints và compact memory sources đủ cho tư vấn.
- Summary tối đa 400 UTF-8 bytes, dựng từ structured state. Canonical state không phụ thuộc summary có còn trong context hay không.
- Model tiếp tục hiểu ý, suy luận, chọn read tools và tự diễn đạt. Handler kiểm thông tin còn thiếu và điều kiện thực thi; không thêm classifier LLM hoặc summarizer mỗi lượt. Các câu không nhận diện được có thể được model chuyển thành read intent trong active public tool set.
- Giữ explicit acceptance và deterministic mutation. Model không tự cấp quyền, xác nhận booking hoặc bỏ qua IDs/version.
- Giữ 3 model calls, 6 tools, 6.000 estimate/call, 12.000/turn, 25 giây; context builder tính cả allowance còn lại của lượt. Sửa lỗi repair chạm budget bằng giảm phần chỉ dẫn lặp, không tăng cap hoặc hạ assertions. Estimate vẫn là byte-based estimate, không phải billed tokens.
- Giữ evidence `known/empty/unknown/unavailable/not_attempted`, authoritative menu data, allergy/hard budget và gateway/CAS/idempotency.

## Memory policy và concurrency

1. Session facts được thu thập cả khi durable memory tắt. Temporary/third-party declarations chỉ áp dụng cho bữa/nhóm; không lưu thành personal facts.
2. Runtime persistence gate dùng explicit extraction, không phụ thuộc `intent === food`; chỉ persist sau CAS thành công, có consent/epoch đúng và không replay.
3. Correction dislike có thể xóa fact tương ứng. Allergy correction bằng câu tự nhiên trả `ALLERGY_CORRECTION_REQUIRES_REVIEW`, giữ protection và hỏi rõ; không biến phủ định thành safety verification.
4. Account advisory transaction lock dùng chung giữa runtime và privacy mutations. Lượt chatbot mới dùng try-lock: bận thì `STATE_CONFLICT`, không cộng thời gian xếp hàng vào turn budget. Thao tác privacy chờ barrier, có lock timeout 25 giây; lỗi thì không báo thành công.
5. Privacy mutation và session invalidation có savepoint để rollback cả khi được gọi bên trong transaction runtime/edit. Scrub tăng state version, clear displayed/pending, giữ current meal constraints và accepted draft. UI có refresh-session khi gặp version conflict; không tự retry mutation.
6. Idempotency giữ request ID/hash và result identity; prose/cards cũ được thay bằng thông báo đã ẩn sau privacy change. Không xóa replay tombstones để rồi thực thi lại yêu cầu cũ.
7. Forget không thu hồi nội dung đã gửi/hiển thị trước khi thao tác hoàn tất. Không hứa xóa mọi bản hiển thị trong browser. Chỉ bảo đảm đường ứng dụng mới không đưa imported memory cũ vào state/model sau barrier.
8. Privacy operations phải đi qua repository ứng dụng này. Direct SQL/RPC từ công cụ quản trị ngoài luồng không được coi là đã tham gia account barrier.

## File thay đổi riêng A03–A05

Đường dẫn source dưới đây tương đối với `supabase/functions/`:

- `_shared/contracts/concierge-v2.ts`: optional structured context/memory schemas và retrieved metadata.
- `_shared/concierge/conversation-context.ts` (mới): goals, clarification, reservation slots, displayed references.
- `_shared/concierge/memory-state.ts` (mới): current/imported layering, effective constraints và conservative legacy handling.
- `_shared/concierge/memory-barrier.ts` (mới): account barrier, transaction cleanup và replay sanitization.
- `_shared/concierge/orchestration/session-memory.ts` (mới): selective ingestion, bounded behavioral refresh và expiry.
- `_shared/concierge/orchestrator.ts`, `context.ts`, `session-summary.ts`: nối các contracts vào runtime/model, giữ tool autonomy và budgets.
- `_shared/concierge/orchestration/main-context.ts`, `turn-context.ts`, `handlers/reservation-handler.ts`, `handlers/draft-handler.ts`: bỏ merge memory mất nguồn, tiếp tục clarification và kiểm referents.
- `_shared/concierge/understanding/constraint-extractor.ts`: số khách viết bằng chữ có giới hạn.
- `_shared/concierge/runtime.ts`, `session-claim.ts`: privacy barrier, postcommit/replay/expiry và claim continuity; dùng reset hiện có.
- `_shared/concierge/memory-repository.ts`, `memory-retrieval.ts`, `memory-extractor.ts`, `response-guard.ts`: atomic privacy changes, metadata/epoch checks, allergy correction và chặn unsupported durable-memory claims.
- `customer-api/memory-handlers.ts`: edit dùng cùng barrier/transaction, không mở transaction lồng trên client đã kết nối.
- Tests: ba suites A03/A04/A05, hai fixture helpers; bổ sung logout/account-switch vào `tests/unit/concierge-api.test.tsx`; thêm `tests/integration/concierge-a03-a05.test.ts`.
- Analysis: cập nhật `plan.md`, thêm báo cáo này.

## Compatibility và rollback

- Không đổi schema bảng/RPC; session vẫn lưu JSON text hiện có. Không cần database migration.
- Fields mới optional, record cũ vẫn parse. Với authenticated legacy session không có provenance, không thể chứng minh arrays cũ là current hay imported: bỏ preferences/dislikes không xác định nguồn, clear history/summary/pending; nếu có allergies cũ, giữ conservative `unverified-additional-allergens` để không nới safety. Scalars và accepted draft được giữ. Không tuyên bố khôi phục được nguồn đã mất.
- Guest claim có nguồn current meal riêng thì giữ các constraints đó, gắn owner mới và cập nhật pending-question version; không import personal facts từ identity cũ.
- Rollback riêng code A03–A05 bằng baseline contents/patch, không đối chiếu HEAD rồi restore cả file vì HEAD chưa chứa A01–A02. Chỉ khôi phục file/hunk nếu hash hiện tại còn khớp bản bàn giao; nếu có thay đổi mới, merge từng hunk.
- Chỉ gỡ các file mới A03–A05 sau khi kiểm chúng chưa có công việc tiếp theo. Giữ `.mcp.json`, `Analysis` khác và toàn bộ A01–A02.
- Vì contracts cũ strict, rollback code sau khi đã phục vụ sessions có fields mới cần drain/expire các session cache đó hoặc giữ compatibility reader. Không áp dụng bản code cũ trực tiếp lên records mới rồi hứa sessions vẫn tiếp tục được. Không có rollback orders/payments/bookings hoặc database migration trong đợt này.

## Kiểm định cuối và phần chưa chạy

Các lệnh dưới đây chạy từ `tiger`, ngày 18/10/2026, kết quả cuối exit **0**:

| Lệnh | Kết quả |
|---|---|
| `npm run typecheck` | PASS; full project/tests, cũng chạy lại qua bước `tsc -b` của build cuối |
| `npm run typecheck:server` | PASS |
| `npm run lint` | PASS; còn warnings ngoài phạm vi, không sửa chúng để làm đẹp báo cáo |
| `npm run check:architecture` | PASS, 264 source files |
| `npm run test:architecture` | PASS, 8 tests; lần đầu bị sandbox chặn spawn, chạy lại với quyền tạo tiến trình |
| `npm run test:unit` | PASS, 195 tests / 32 files; gồm 2 ca logout/account-switch mới |
| `npm run test:server` | PASS, 572 tests / 41 files; gồm 50 regression A03–A05 và các regression A01–A02 hiện có |
| `npm run build` | PASS, 2.190 modules; chỉ build cục bộ, không deploy |
| `git diff --check` | PASS |

Các lỗi trung gian đã sửa gồm context repair vượt turn allowance, ngày bị mất khi giờ còn mơ hồ, normalization giờ có khoảng trắng thừa, guard nhầm cụm “địa chỉ đã lưu”, và route bỏ qua restaurant tool do model phát hiện. Không hạ assertions của các suites có sẵn. Một fixture mới ban đầu chứa từ “thêm” nên không thuộc nhánh `other` như mục đích test; đã sửa câu fixture và giữ nguyên các assertions.

| Gói | Trạng thái bàn giao |
|---|---|
| A03 | Đạt cục bộ: clarification, referents, acceptance và model-selected read tools |
| A04 | Đạt cục bộ: structured state, thresholds, trimming, compatibility; PostgreSQL integration thật chưa chạy |
| A05 | Đạt cục bộ: provenance, lifecycle, controlled runtime races, replay/consent/identity; barrier trên PostgreSQL thật chưa nghiệm thu |

Manifest rollback tại `C:\Users\USER\Downloads\New Agent\tiger-a03-a05-baseline\a03-a05-changes.json` ghi file thay đổi/thêm mới và SHA-256 trước/sau. Dùng nó để phát hiện công việc phát sinh sau bàn giao trước khi khôi phục baseline.

- Chưa chạy PostgreSQL/browser integration: không có `TEST_ENVIRONMENT`, `TEST_INSTANCE_IDENTITY` hoặc disposable database được xác minh; không phát hiện Docker CLI trong môi trường hiện tại. Không kết nối database mặc định để thử vượt guard.
- Đã viết hai PostgreSQL integration cases có isolation guard/global setup; chưa có bằng chứng chúng chạy thành công trên PostgreSQL thật.
- Không sửa transport/frontend streaming; các unit/server stream suites nằm trong bộ kiểm tra cục bộ. Các suites database streaming/browser/persistence vẫn cần test environment hợp lệ.
- Chưa xác minh website URL/backend version/schema/flags/effective provider config, chưa chạy real-browser smoke hoặc đo provider latency/cost. Cần môi trường test được phê duyệt và quyền gọi provider có phí để nghiệm thu theo `AGENTS.md`.
- Không bảo đảm hiểu mọi paraphrase hoặc mọi tham chiếu ngoài các dạng đã kiểm. Pattern-based extraction vẫn có giới hạn; model-selected read tools giữ khả năng xử lý câu ngoài mẫu trong budget.

**Runtime chatbot: CHƯA KIỂM ĐỊNH.**
