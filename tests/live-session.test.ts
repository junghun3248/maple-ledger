import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clock,
  dueAlerts,
  elapsedMs,
  initialLiveState,
  pauseSession,
  readLiveState,
  readPrefill,
  remainingMs,
  resumeSession,
  sessionMinutes,
  startSession,
  startTimer,
  stopTimer,
  type Timer,
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
  // 저장한 JSON을 다시 읽어도 같은 시간이 나온다.
  const state = readLiveState(JSON.stringify({ ...initialLiveState, session: s }));
  assert.deepEqual(state.session, s);
  assert.equal(sessionMinutes(s, 55 * MIN + 29000), 40);
});

test('record minutes stay within the hunting record limits', () => {
  assert.equal(sessionMinutes(startSession(0), 1000), 1);
  assert.equal(sessionMinutes(startSession(0), 2000 * MIN), 1440);
});

const timer = (repeat: boolean): Timer => ({
  id: 't',
  label: '재획비',
  seconds: 30 * 60,
  repeat,
  startedAt: null,
  alerted: 0,
});

test('timers count down from an absolute start time', () => {
  assert.equal(remainingMs(timer(false), 0), null);
  const once = startTimer(timer(false), 0);
  assert.equal(remainingMs(once, 10 * MIN), 20 * MIN);
  assert.equal(remainingMs(once, 40 * MIN), 0);
  const repeat = startTimer(timer(true), 0);
  assert.equal(remainingMs(repeat, 31 * MIN), 29 * MIN);
  assert.equal(stopTimer(repeat).startedAt, null);
});

test('each finished cycle alerts once, and old ones alert silently', () => {
  let timers = [startTimer(timer(true), 0)];
  let result = dueAlerts(timers, 29 * MIN);
  assert.equal(result.due.length, 0);
  result = dueAlerts(timers, 30 * MIN + 1000);
  assert.deepEqual(result.due, [{ id: 't', label: '재획비', fresh: true }]);
  timers = result.timers;
  assert.equal(dueAlerts(timers, 30 * MIN + 5000).due.length, 0, 'same cycle alerts once');
  // 창을 닫아 둔 사이 여러 주기가 지나면 한 번만, 소리 없이 표시한다.
  const late = dueAlerts(timers, 125 * MIN);
  assert.deepEqual(late.due, [{ id: 't', label: '재획비', fresh: false }]);
  assert.equal(late.timers[0].alerted, 4);
  // 1회 타이머는 끝난 뒤 다시 알리지 않는다.
  const once = dueAlerts([startTimer(timer(false), 0)], 31 * MIN).timers;
  assert.equal(dueAlerts(once, 90 * MIN).due.length, 0);
});

test('broken storage falls back to safe defaults', () => {
  assert.deepEqual(readLiveState('{bad'), initialLiveState);
  assert.deepEqual(readLiveState(JSON.stringify({ timers: 'x' })), initialLiveState);
  assert.equal(readPrefill(JSON.stringify({ date: '2026-11-21', minutes: 0 })), null);
  assert.deepEqual(readPrefill(JSON.stringify({ date: '2026-11-21', minutes: 62 })), {
    date: '2026-11-21',
    minutes: 62,
  });
});

test('clock formats minutes and hours', () => {
  assert.equal(clock(65000), '01:05');
  assert.equal(clock(3725000), '1:02:05');
});
