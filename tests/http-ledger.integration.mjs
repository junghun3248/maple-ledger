import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const base = process.env.LEDGER_TEST_URL;
if (!base || !/^http:\/\/127\.0\.0\.1:\d+$/.test(base))
  throw Error('Set LEDGER_TEST_URL to the local preview URL.');
const name = 'refactor-check-' + randomUUID() + '-long-book-name';
const password = randomUUID();
async function request(action, data = {}, cookie = '') {
  const response = await fetch(base + '/api/ledger', {
    method: action ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', origin: base, cookie },
    body: action ? JSON.stringify({ action, ...data }) : undefined,
  });
  return {
    status: response.status,
    data: await response.json(),
    cookie: response.headers.get('set-cookie')?.split(';')[0] || cookie,
  };
}
assert.equal((await request()).status, 401);
const created = await request('create', { name, password });
assert.equal(created.status, 200);
const other = await request('open', { name, password });
assert.equal(other.status, 200);
const record = {
  id: randomUUID(),
  date: '2026-10-25',
  bm: '100',
  am: '200',
  bf: '898',
  af: '900',
  memo: 'integration fixture',
  minutes: 60,
};
const saved = await request('save', { revision: 0, records: [record] }, created.cookie);
assert.equal(saved.status, 200);
const reloaded = await request(undefined, {}, other.cookie);
assert.deepEqual(reloaded.data.records, [record]);
assert.equal((await request('save', { revision: 0, records: [] }, other.cookie)).status, 409);
const state = {
  characters: [
    {
      id: randomUUID(),
      name: 'test character',
      runs: [
        {
          id: randomUUID(),
          name: '스우',
          difficulty: '하드',
          period: 'week',
          date: '2026-10-30',
          party: 6,
          crystal: '48900000',
          fee: 500,
          cleared: true,
          drops: [
            {
              id: 'item-0',
              name: 'test drop',
              icon: '/boss-icons/item-0.png',
              selected: true,
              qty: 1,
              price: '1000000000',
            },
          ],
        },
      ],
    },
  ],
};
assert.equal((await request('boss-save', { revision: 0, state }, created.cookie)).status, 200);
assert.deepEqual((await request('boss-read', {}, other.cookie)).data.state, state);
assert.equal(
  (await request('boss-save', { revision: 0, state: { characters: [] } }, other.cookie)).status,
  409,
);
assert.equal((await request('close', {}, created.cookie)).status, 200);
assert.equal((await request(undefined, {}, created.cookie)).status, 401);
assert.equal((await request(undefined, {}, other.cookie)).status, 200);
console.log(
  'PASS: two sessions, long book name, hunting and boss persistence, stale revision rejection, independent logout',
);
