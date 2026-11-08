import { z } from 'zod';
export class NexonError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// One reader per incoming batch. Space outgoing starts, including retry attempts.
export function nexonReader(key: string) {
  let queue = Promise.resolve();
  const signal = AbortSignal.timeout(18000);
  return async function read(path: string): Promise<unknown> {
    for (let attempt = 0; attempt < 2; attempt++) {
      queue = queue.then(() => pause(300));
      await queue;
      const response = await fetch('https://open.api.nexon.com/maplestory/v1/' + path, {
        headers: { 'x-nxopen-api-key': key },
        signal,
        redirect: 'manual',
      });
      if (response.ok) return response.json();
      const body = await response.json().catch(() => null);
      if (response.status === 429 && attempt === 0) {
        await pause(1000);
        continue;
      }
      const code =
        z.object({ error: z.object({ name: z.string() }) }).safeParse(body).data?.error.name || '';
      const messages: Record<string, string> = {
        OPENAPI00002: 'API 키에 조회 권한이 없어요. 본인 계정과 키 권한을 확인해 주세요.',
        OPENAPI00003: '캐릭터 식별 정보가 유효하지 않아요.',
        OPENAPI00005: 'API 키가 유효하지 않아요. 키를 다시 확인해 주세요.',
        OPENAPI00009: '넥슨에서 캐릭터 데이터를 준비 중이에요. 접속 후 나중에 다시 조회해 주세요.',
        OPENAPI00010: '넥슨 API 점검 중이에요.',
        OPENAPI00011: '넥슨 API 점검 중이에요.',
      };
      throw new NexonError(
        response.status === 429
          ? '넥슨 API 호출 한도에 도달했어요. 잠시 후 재시도하고, 계속되면 일일 사용량을 확인해 주세요.'
          : messages[code] ||
              '넥슨 캐릭터 조회에 실패했어요. 키 권한과 캐릭터 접속 여부를 확인해 주세요.',
        response.status === 429 ? 429 : 400,
      );
    }
    throw new NexonError('넥슨 조회를 다시 시도해 주세요.', 502);
  };
}
