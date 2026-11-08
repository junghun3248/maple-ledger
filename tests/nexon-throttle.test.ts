import test from 'node:test';
import assert from 'node:assert/strict';
import { nexonReader } from '../server/ledger/nexon-client';
test('parallel reads are spaced and a temporary 429 is retried once', async () => {
  const original = globalThis.fetch;
  const starts: number[] = [];
  let limited = false;
  globalThis.fetch = async (url) => {
    starts.push(Date.now());
    if (String(url).endsWith('limited') && !limited) {
      limited = true;
      return Response.json({ error: { name: 'OPENAPI00007' } }, { status: 429 });
    }
    return Response.json({ ok: true });
  };
  try {
    const read = nexonReader('test-key');
    const values = await Promise.all(['one', 'limited', 'three'].map(read));
    assert.equal(values.length, 3);
    assert.equal(starts.length, 4);
    for (let i = 1; i < starts.length; i++) assert.ok(starts[i] - starts[i - 1] >= 270);
  } finally {
    globalThis.fetch = original;
  }
});
test('invalid keys are reported safely without retry', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({ error: { name: 'OPENAPI00005', message: 'secret' } }, { status: 400 });
  };
  try {
    await assert.rejects(nexonReader('test-key')('test'), /API 키가 유효하지/);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
});
