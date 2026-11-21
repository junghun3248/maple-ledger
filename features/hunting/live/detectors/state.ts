/**
 * 한 프레임의 판정이 흔들려도 알림이 깜빡이지 않도록, 연속으로 맞아야 "보임",
 * 연속으로 틀려야 "안 보임"으로 바꾼다. 같은 알림은 쿨다운 동안 다시 울리지 않는다.
 */
export type WatchMode = 'appear' | 'disappear';
export type Presence = {
  present: boolean;
  hits: number;
  misses: number;
  alertedAt: number | null;
};
export const initialPresence: Presence = { present: false, hits: 0, misses: 0, alertedAt: null };

export const ENTER_FRAMES = 2;
export const LEAVE_FRAMES = 3;
export const COOLDOWN_MS = 60000;

export function observe(state: Presence, matched: boolean, mode: WatchMode, now: number) {
  const hits = matched ? state.hits + 1 : 0;
  const misses = matched ? 0 : state.misses + 1;
  let present = state.present;
  let changed = false;
  if (!present && hits >= ENTER_FRAMES) {
    present = true;
    changed = true;
  } else if (present && misses >= LEAVE_FRAMES) {
    present = false;
    changed = true;
  }
  const wanted = mode === 'appear' ? present : !present;
  const cooled = state.alertedAt === null || now - state.alertedAt >= COOLDOWN_MS;
  const alert = changed && wanted && cooled;
  return {
    state: { present, hits, misses, alertedAt: alert ? now : state.alertedAt },
    alert,
  };
}
