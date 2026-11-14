import { ledgerDatabase } from '@/db/ledger';
import { countVisit } from '@/server/visitors/service';
import { visitRequestSchema } from '@/contracts/visitors/schema';
import { limit } from '@/server/ledger/rate-limit';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'no-store' };
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return Response.json({ error: 'Invalid origin' }, { status: 403, headers });
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    return Response.json({ error: 'Invalid content type' }, { status: 415, headers });
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: 'Invalid request' }, { status: 400, headers });
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 200) {
      await reader.cancel();
      return Response.json({ error: 'Invalid request' }, { status: 400, headers });
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const body = new TextDecoder().decode(bytes);
  if (body.length > 200)
    return Response.json({ error: 'Invalid request' }, { status: 400, headers });
  let parsed;
  try {
    parsed = visitRequestSchema.safeParse(JSON.parse(body));
  } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400, headers });
  }
  if (!parsed.success) return Response.json({ error: 'Invalid request' }, { status: 400, headers });
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  if (!(await limit('visit:' + ip, 20, 60000)))
    return Response.json({ error: 'Too many requests' }, { status: 429, headers });
  return Response.json(await countVisit(ledgerDatabase(), parsed.data.visitor), { headers });
}
