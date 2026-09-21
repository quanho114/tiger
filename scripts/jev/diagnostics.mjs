const stages = new Set(['setup', 'agent_init', 'predict', 'action', 'assertions', 'cleanup']);
const reasons = new Set(['ADAPTER_ERROR', 'BROWSER_ERROR', 'MODEL_HTTP_ERROR', 'MODEL_CONNECTION_ERROR', 'MODEL_INVALID_RESPONSE', 'ACTION_ERROR', 'ASSERTIONS_ERROR', 'CLEANUP_ERROR']);
// Never propagate arbitrary child output, even if it resembles a diagnostic.
export function adapterDiagnostic(output) {
  try {
    const value = JSON.parse(output);
    if (value.status !== 'error' || !stages.has(value.stage) || !reasons.has(value.reason)) return {};
    const result = { stage: value.stage, reason: value.reason };
    if (value.reason === 'MODEL_HTTP_ERROR' && Number.isInteger(value.http_status) && value.http_status >= 400 && value.http_status <= 599) result.http_status = value.http_status;
    return result;
  } catch { return {}; }
}
