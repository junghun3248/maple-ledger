/**
 * 프레임마다 나온 판정을 시간 기준으로 다듬어 한두 프레임 흔들려도 알림이 잘못 울리지 않게 한다.
 * 남은 시간이 있는 감지(버프·야누스·룬 쿨타임)는 countdown.ts에서 쓴다.
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
