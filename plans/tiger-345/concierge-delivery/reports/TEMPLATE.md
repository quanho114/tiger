# Report Cxx — <Tên task>

## Metadata

- Status: TODO / IN_PROGRESS / BLOCKED / READY_FOR_REVIEW.
- Timestamp/timezone:
- Commit hoặc workspace snapshot/file hashes:
- Requirement IDs / acceptance IDs / dependencies:
- Owned files và edits ngoài scope cần bảo toàn:
- Environment: isolated DB identity/marker (không secret), provider STUB/LIVE/NOT_RUN.

## Baseline và phạm vi

Finding nào tái hiện? Finding nào đã được sửa trước? Ghi trigger, observed result, file:line và evidence. Không nhận công edits của agent khác. Liệt kê mọi yêu cầu con của mục thiết kế gốc được task sở hữu.

## Đường chạy thực tế

Entrypoint → auth/state → tool/service → DB/transaction → response → UI. Ghi file:line cụ thể, contract/version và lý do thay đổi. Helper chưa nối không tính hoàn thành.

## Ma trận evidence

| Requirement/AT/case | Expected + forbidden side effects | Test/file | Artifact | Verdict |
|---|---|---|---|---|
| <ID> | <behavior> | <path/test name> | <path> | NOT_RUN |

## Commands đã chạy

| Exact command/filter | Timestamp | Exit | Executed/pass/fail/skip | Artifact |
|---|---|---|---|---|
| <command> | <time> | <code> | <counts> | <path> |

Ghi full suite hay filtered; đếm benchmark scenarios riêng với test blocks, không cộng hai lần. Không chép output chưa chạy; không lưu secrets hoặc PII thật.

## Negative tests và durability

Nêu injected failures/races, số business records trước/sau, receipt và version. Test có bắt được lỗi cũ không? Trường hợp không áp dụng cần giải thích, không bỏ trống.

## Self-review

Findings severity + file:line + impact + resolution. Ghi những gì chưa kiểm chứng. Không gọi đây là independent review.

## External gates và blockers

| Gate/phần việc | Trạng thái | Thiếu gì | Owner | Next action |
|---|---|---|---|---|
| <X/task> | NOT_VERIFIED | <evidence> | <owner> | <action> |

## Rollback và handoff

Feature/config/schema version, cách tắt an toàn, receipt reconciliation, downstream tasks cần revalidate. Không rollback bằng xóa giao dịch đã commit.

## Reviewer only

Để trống verdict ACCEPTED/CHANGES_REQUESTED cho reviewer/user. Reviewer ghi snapshot, findings và acceptance thực sự đã xác minh.
