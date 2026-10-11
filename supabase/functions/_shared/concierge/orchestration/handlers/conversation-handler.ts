/**
 * Tiger Agent V3 — Phase 4: Conversation handler.
 *
 * Owns greeting/identity/thanks/farewell/generic smalltalk plus the
 * refresh_session action. No factual access: everything goes through
 * modelConversation + safeConversationReply (response guard preserved).
 */

import type { TurnScope } from '../turn-context.ts'

export async function handleRefresh(scope: TurnScope): Promise<void> {
  scope.result.message = 'Đã cập nhật trạng thái phiên. Hãy kiểm tra trước khi thao tác tiếp.'
}

export async function handleConversation(scope: TurnScope): Promise<void> {
  const prompt = scope.request.action?.type === 'open_conversation'
    ? 'Chào khách ngắn gọn dựa trên trang hiện tại và hỏi một câu hữu ích; không tự suy đoán thông tin cá nhân.'
    : (scope.request.message ?? '')
  await scope.helpers.modelConversation(prompt)
}
