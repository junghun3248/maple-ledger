/**
 * 프레임마다 나온 판정을 시간 기준으로 다듬어 한두 프레임 흔들려도 알림이 잘못 울리지 않게 한다.
 * 룬처럼 "나타나면 알림"인 감지는 observeAppear, 남은 시간이 있는 감지는 countdown.ts를 쓴다.
 */
export type Flag = { value: boolean; raw: boolean | null; since: number };
export const flag = (value: boolean): Flag => ({ value, raw: null, since: 0 });

/** 같은 판정이 onMs(켜짐)·offMs(꺼짐) 이상 이어져야 값이 바뀐다. */
export function settle(f: Flag, raw: boolean, now: number, onMs: number, offMs: number): Flag {
  const since = f.raw === raw ? f.since : now;
  const steady = now - since >= (raw ? onMs : offMs);
  return { value: steady ? raw : f.value, raw, since };
}

export const ICON_ON_MS = 400;
export const ICON_OFF_MS = 2000;
export const COOLDOWN_MS = 60000;

export type Appear = { icon: Flag; alertedAt: number | null };
export const initialAppear: Appear = { icon: flag(false), alertedAt: null };

/** 아이콘이 나타나면 한 번 알린다. 같은 알림은 60초 동안 다시 울리지 않는다. */
export function observeAppear(state: Appear, seen: boolean, now: number) {
  const icon = settle(state.icon, seen, now, ICON_ON_MS, ICON_OFF_MS);
  const cooled = state.alertedAt === null || now - state.alertedAt >= COOLDOWN_MS;
  const alert = !state.icon.value && icon.value && cooled;
  return { state: { icon, alertedAt: alert ? now : state.alertedAt }, alert };
}
