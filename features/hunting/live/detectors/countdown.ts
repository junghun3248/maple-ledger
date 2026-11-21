import { flag, ICON_OFF_MS, ICON_ON_MS, settle, type Flag } from './state';

/**
 * 남은 시간이 있는 감지(버프·야누스·부스터)를 다룬다.
 * 화면에서 읽은 남은 시간(초)은 가끔 틀릴 수 있으므로, 이전 추정과 맞거나 두 번 연속 서로 맞을 때만 믿는다.
 * 읽지 않는 사이에는 시각으로 줄여 가고, 10초 이하가 되면 한 번만 알린다.
 * 다시 써서 남은 시간이 늘어나면(15초 초과) 알리지 않고 다음 알림만 준비한다.
 *
 * 버프는 1분 넘게 남으면 흰 분 숫자, 1분 아래면 노란 초 숫자를 보여 준다. 흰 분 숫자가 사라지는 순간을
 * 남은 59초로 잡으므로, 노란 초 숫자를 못 읽어도 10초 전에 알릴 수 있다.
 */
export const MINUTE_LEFT = 59;
export const ALERT_AT = 10;
export const REARM_ABOVE = 15;
export const AGREE = 2.5;

type Estimate = { remaining: number; at: number };
export type Countdown = {
  icon: Flag;
  number: Flag;
  long: Flag;
  estimate: Estimate | null;
  pending: Estimate | null;
  warned: boolean;
};
export const initialCountdown: Countdown = {
  icon: flag(false),
  number: flag(false),
  long: flag(false),
  estimate: null,
  pending: null,
  warned: true,
};

const left = (e: Estimate | null, now: number) => (e ? e.remaining - (now - e.at) / 1000 : null);

export type Seen = {
  icon: boolean;
  /** 이번 프레임에서 읽은 남은 시간(초). 읽지 않았거나 못 읽었으면 undefined/null */
  seconds?: number | null;
  /** seconds를 읽은 화면이 찍힌 시각. 읽는 데 시간이 걸려도 그 시각 기준으로 계산한다. */
  secondsAt?: number;
  /** 1분 넘게 남았다는 표시(버프의 흰 분 숫자). 버프는 매 프레임 true/false로 넘긴다. */
  long?: boolean;
  /** 남은 시간 숫자가 보이는지(남은 시간을 전혀 모를 때만, 5초 전 숫자 사라짐을 마지막 수단으로 쓴다) */
  number?: boolean;
};

export function track(state: Countdown, seen: Seen, now: number) {
  const icon = settle(state.icon, seen.icon, now, ICON_ON_MS, ICON_OFF_MS);
  const number =
    seen.icon && seen.number !== undefined
      ? settle(state.number, seen.number, now, 1000, 600)
      : state.number;
  // 흰 분 숫자는 1초 넘게 안 보여야 사라졌다고 본다(한두 프레임 흔들림 무시).
  const long =
    seen.icon && seen.long !== undefined ? settle(state.long, seen.long, now, 0, 1000) : state.long;
  let { estimate, pending, warned } = state;

  if (!icon.value && state.icon.value) {
    estimate = null;
    pending = null;
  }
  if (seen.long) {
    warned = false;
    estimate = null;
    pending = null;
  } else if (state.long.value && !long.value && icon.value) {
    // 흰 분 숫자가 사라진 때(1분 아래로 바뀐 때) = 남은 59초
    estimate = { remaining: MINUTE_LEFT, at: long.since };
    pending = null;
  } else if (seen.icon && typeof seen.seconds === 'number') {
    const reading = { remaining: seen.seconds, at: seen.secondsAt ?? now };
    const predicted = left(estimate, reading.at);
    const expected = left(pending, reading.at);
    if (predicted !== null && Math.abs(seen.seconds - predicted) <= AGREE) {
      estimate = reading;
      pending = null;
    } else if (expected !== null && Math.abs(seen.seconds - expected) <= AGREE) {
      estimate = reading;
      pending = null;
    } else pending = reading;
    if (estimate === reading && reading.remaining > REARM_ABOVE) warned = false;
  }

  const remaining = left(estimate, now);
  let alert = false;
  if (!warned && icon.value && remaining !== null && remaining <= ALERT_AT) alert = true;
  // 남은 시간을 전혀 모를 때만(1분 아래에서 감지를 시작한 경우 등): 버프 숫자가 사라지면(5초 전) 한 번 알린다.
  if (!warned && icon.value && remaining === null && state.number.value && !number.value)
    alert = true;
  if (alert) warned = true;

  return {
    state: { icon, number, long, estimate, pending, warned },
    alert,
    remaining: remaining === null ? null : Math.max(0, remaining),
  };
}

/**
 * 화면에 보이는 시간 모양. 잘못 읽은 글자를 걸러 내려고 감지마다 받는 모양을 정해 둔다.
 * - clock: 야누스 "1:11"  - decimal: 부스터 "53.73"(또는 "1:11")  - seconds: 버프 초 "45"(1~59)
 */
export type TimeFormat = 'clock' | 'decimal' | 'seconds';

/**
 * 여러 글자 중 부스터 남은 시간("53.73") 모양 하나를 찾는다. 데미지 숫자처럼 소수점이 없는 글자는 버린다.
 * "초"가 숫자로 잘못 읽혀 붙어도("53.734") 앞의 두 자리만 쓴다.
 */
export function findDecimal(text: string) {
  const tokens = text
    .split(/\s+/)
    .map((t) => t.replace(/[^0-9.]/g, ''))
    .filter(Boolean);
  for (const token of tokens) {
    const m = /^(\d{1,3})\.(\d{2})\d?$/.exec(token);
    if (m) return Number(`${m[1]}.${m[2]}`);
  }
  // 작은 소수점은 자주 빠진다. "5373"처럼 3~4자리면 뒤 두 자리를 소수로 본다.
  // 데미지 숫자 같은 엉뚱한 값은 두 번 연속 맞아야 믿는 track()에서 걸러진다.
  for (const token of tokens) {
    const m = /^(\d{1,2})(\d{2})$/.exec(token);
    if (m) return Number(`${m[1]}.${m[2]}`);
  }
  // "53 73"처럼 소수점 자리에서 끊겨 읽힌 경우
  for (let i = 0; i + 1 < tokens.length; i++)
    if (/^\d{1,2}$/.test(tokens[i]) && /^\d{2}$/.test(tokens[i + 1]))
      return Number(`${tokens[i]}.${tokens[i + 1]}`);
  return null;
}

/** 읽은 글자를 남은 초로 바꾼다. 숫자가 아닌 글자는 지우고, 모양이 맞지 않으면 null. */
export function parseSeconds(text: string, format: TimeFormat) {
  const t = text.replace(/[^0-9:.]/g, '');
  const clock = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (clock && format !== 'seconds')
    return Number(clock[2]) < 60 ? Number(clock[1]) * 60 + Number(clock[2]) : null;
  const decimal = /^(\d{1,3})\.(\d{2})$/.exec(t);
  if (decimal && format === 'decimal') return Number(`${decimal[1]}.${decimal[2]}`);
  const whole = /^(\d{1,2})$/.exec(t);
  if (whole && format === 'seconds') {
    const n = Number(whole[1]);
    return n >= 1 && n <= 59 ? n : null;
  }
  return null;
}
