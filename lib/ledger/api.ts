export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
export async function ledgerRequest(
  action?: string,
  data: Record<string, unknown> = {},
): Promise<unknown> {
  // GET은 본문이 없으므로 data를 쿼리 문자열로 보낸다(예: 바뀐 게 없는지 확인할 revision).
  const query =
    !action && Object.keys(data).length
      ? '?' + new URLSearchParams(Object.entries(data).map(([k, v]) => [k, String(v)]))
      : '';
  const response = await fetch('/api/ledger' + query, {
    method: action ? 'POST' : 'GET',
    headers: action ? { 'Content-Type': 'application/json' } : {},
    body: action ? JSON.stringify({ action, ...data }) : undefined,
    cache: 'no-store',
    signal: AbortSignal.timeout(20000),
  });
  const result: unknown = await response.json();
  if (!response.ok) {
    const message =
      result && typeof result === 'object' && 'error' in result && typeof result.error === 'string'
        ? result.error
        : '요청을 처리하지 못했어요.';
    throw new ApiError(message, response.status);
  }
  return result;
}
export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : '요청을 처리하지 못했어요.';
