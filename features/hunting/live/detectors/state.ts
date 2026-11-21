/**
 * 프레임마다 나온 판정(아이콘이 보이는가, 버프 숫자가 보이는가)을 시간 기준으로 다듬어
 * 한두 프레임 흔들려도 알림이 잘못 울리지 않게 한다.
 * - 룬(appear): 아이콘이 나타나면 알린다. 같은 알림은 60초 동안 다시 울리지 않는다.
 * - 버프(disappear): 아이콘은 그대로인데 남은 시간 숫자가 사라지면(5초 남음) "곧 끝남"을 알린다.
 *   숫자 없이 아이콘이 사라지면 "꺼짐"을 알린다. 숫자가 다시 보이면(재사용) 다시 알릴 준비를 한다.
 */
export type WatchMode = 'appear' | 'disappear';
export type WatchAlert = 'appear' | 'soon' | 'gone';

type Flag = { value: boolean; raw: boolean | null; since: number };
const flag = (value: boolean): Flag => ({ value, raw: null, since: 0 });

/** 같은 판정이 onMs(켜짐)·offMs(꺼짐) 이상 이어져야 값이 바뀐다. */
function settle(f: Flag, raw: boolean, now: number, onMs: number, offMs: number): Flag {
  const since = f.raw === raw ? f.since : now;
  const steady = now - since >= (raw ? onMs : offMs);
  return { value: steady ? raw : f.value, raw, since };
}

export type Presence = {
  icon: Flag;
  number: Flag;
  warned: boolean;
  alertedAt: number | null;
};
export const initialPresence: Presence = {
  icon: flag(false),
  number: flag(false),
  warned: true,
  alertedAt: null,
};

export const ICON_ON_MS = 400;
export const ICON_OFF_MS = 2000;
export const NUMBER_ON_MS = 1000;
export const NUMBER_OFF_MS = 600;
export const COOLDOWN_MS = 60000;

export function observe(
  state: Presence,
  seen: { icon: boolean; number?: boolean },
  mode: WatchMode,
  now: number,
  /** 남은 시간 숫자 칸을 등록한 버프인가 */
  numbered = false,
) {
  const icon = settle(state.icon, seen.icon, now, ICON_ON_MS, ICON_OFF_MS);
  // 아이콘이 안 보이는 프레임에서는 숫자 판정을 하지 않는다(아이콘째 사라진 것과 구분).
  const number =
    seen.icon && seen.number !== undefined
      ? settle(state.number, seen.number, now, NUMBER_ON_MS, NUMBER_OFF_MS)
      : state.number;
  let warned = state.warned;
  let alert: WatchAlert | null = null;

  if (mode === 'appear') {
    const cooled = state.alertedAt === null || now - state.alertedAt >= COOLDOWN_MS;
    if (!state.icon.value && icon.value && cooled) alert = 'appear';
  } else {
    if (icon.value && number.value) warned = false;
    else if (!warned && icon.value && state.number.value && !number.value) {
      warned = true;
      alert = 'soon';
    } else if (!warned && state.icon.value && !icon.value) {
      warned = true;
      alert = 'gone';
    }
    // 숫자 칸이 없는 감지(부스터)는 아이콘이 새로 나타날 때 알릴 준비를 한다.
    if (!numbered && !state.icon.value && icon.value) warned = false;
  }

  return {
    state: { icon, number, warned, alertedAt: alert ? now : state.alertedAt },
    alert,
  };
}
