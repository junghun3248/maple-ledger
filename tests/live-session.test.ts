import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clock,
  elapsedMs,
  initialLiveState,
  pauseSession,
  prefillSchema,
  readLiveState,
  resumeSession,
  sessionMinutes,
  startSession,
} from '@/features/hunting/live/session';

const MIN = 60000;

test('session time excludes paused time and survives reloads', () => {
  let s = startSession(0);
  assert.equal(elapsedMs(s, 10 * MIN), 10 * MIN);
  s = pauseSession(s, 10 * MIN);
  assert.equal(elapsedMs(s, 25 * MIN), 10 * MIN, 'paused clock does not move');
  assert.equal(pauseSession(s, 30 * MIN), s, 'pausing twice keeps the first pause');
  s = resumeSession(s, 25 * MIN);
  assert.equal(elapsedMs(s, 55 * MIN), 40 * MIN);
  const state = readLiveState(JSON.stringify({ ...initialLiveState, session: s }));
  assert.deepEqual(state.session, s);
  assert.equal(sessionMinutes(s, 55 * MIN + 29000), 40);
});

test('record minutes stay within the hunting record limits', () => {
  assert.equal(sessionMinutes(startSession(0), 1000), 1);
  assert.equal(sessionMinutes(startSession(0), 2000 * MIN), 1440);
});

test('saved state from older versions still loads', () => {
  // 1단계(수동 타이머)와 2단계 초기 저장값
  const v1 = { session: null, timers: [{ id: 't' }], sound: true, volume: 0.5 };
  const state = readLiveState(JSON.stringify(v1));
  assert.deepEqual(state.watchers, []);
  assert.deepEqual(state.readings, {});
  assert.equal(state.volume, 0.5);
  assert.equal('timers' in state, false);
  assert.deepEqual(readLiveState('{bad'), initialLiveState);
});

test('prefill carries minutes and digit-only readings', () => {
  assert.equal(prefillSchema.safeParse({ date: '2026-11-21', minutes: 0 }).success, false);
  assert.deepEqual(prefillSchema.parse({ date: '2026-11-21', minutes: 62, bm: '12345' }), {
    date: '2026-11-21',
    minutes: 62,
    bm: '12345',
  });
  assert.equal(
    prefillSchema.safeParse({ date: '2026-11-21', minutes: 60, bm: '1,234' }).success,
    false,
  );
});

test('clock formats minutes and hours', () => {
  assert.equal(clock(65000), '01:05');
  assert.equal(clock(3725000), '1:02:05');
});

test('watchers saved before kinds existed get a kind', () => {
  const base = {
    id: 'w',
    label: '알림',
    frame: { w: 800, h: 450 },
    area: { x: 0, y: 0, w: 100, h: 50 },
    icon: 'data:image/png;base64,AAAA',
    threshold: 0.9,
    enabled: true,
  };
  const state = readLiveState(
    JSON.stringify({
      ...initialLiveState,
      watchers: [
        { ...base, mode: 'appear' },
        { ...base, mode: 'disappear', number: { x: 1, y: 2, w: 10, h: 5 }, digits: 30 },
        { ...base, mode: 'disappear' },
      ],
    }),
  );
  assert.deepEqual(
    state.watchers.map((w) => w.kind),
    ['rune', 'buff'], // 예전 부스터 등록은 자동 읽기로 바뀌어 빠진다
  );
});

test('fragment slot photos are kept only as small PNG data', () => {
  const crop = 'data:image/png;base64,iVBORw0KGgo=';
  const state = readLiveState(JSON.stringify({ ...initialLiveState, crops: { b: crop } }));
  assert.deepEqual(state.crops, { b: crop });
  assert.deepEqual(
    readLiveState(JSON.stringify({ session: null, sound: true, volume: 1 })).crops,
    {},
  );
  assert.deepEqual(
    readLiveState(
      JSON.stringify({ ...initialLiveState, crops: { b: 'https://example.com/x.png' } }),
    ),
    initialLiveState,
  );
});

test('booster reads automatically now, so old booster registrations are dropped', () => {
  const booster = {
    id: 'b',
    label: '부스터',
    kind: 'booster',
    frame: { w: 800, h: 450 },
    area: { x: 0, y: 0, w: 100, h: 50 },
    icon: 'data:image/png;base64,AAAA',
    threshold: 0.9,
    enabled: true,
  };
  const state = readLiveState(
    JSON.stringify({
      ...initialLiveState,
      watchers: [booster, { ...booster, id: 'j', kind: 'janus' }],
    }),
  );
  assert.deepEqual(
    state.watchers.map((w) => w.kind),
    ['janus'],
  );
  assert.equal(state.booster, true, 'automatic booster alert is on by default');
});
