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
  const response = await fetch('/api/ledger', {
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
