import { flag, ICON_OFF_MS, ICON_ON_MS, settle, type Flag } from './state';

/**
 * 남은 시간이 있는 감지(버프·야누스)를 다룬다.
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
  /** 마지막으로 알린 시각 */
  alertedAt: number | null;
};
export const initialCountdown: Countdown = {
  icon: flag(false),
  number: flag(false),
  long: flag(false),
  estimate: null,
  pending: null,
  warned: true,
  alertedAt: null,
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

/** 룬 쿨타임은 끝날 때 알린다. 아이콘이 사라지면 추정이 지워지므로 2초 남았을 때 알린다. */
export const RUNE_ALERT_AT = 2;

/** 아이콘이 사라졌을 때 알리지 않는 간격: 그 직전에 남은 시간으로 이미 알렸으면 다시 알리지 않는다. */
export const GONE_QUIET_MS = 30_000;

/**
 * alertAt: 남은 시간이 이 초 이하가 되면 알린다(버프·야누스 10초, 룬 쿨타임 2초).
 * alertOnGone: 남은 시간을 못 읽었더라도 보이던 아이콘이 사라지면(버프가 꺼짐·룬 쿨타임 끝) 한 번 알린다.
 */
export function track(
  state: Countdown,
  seen: Seen,
  now: number,
  alertAt = ALERT_AT,
  alertOnGone = false,
) {
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
    } else if (
      expected !== null &&
      Math.abs(seen.seconds - expected) <= AGREE &&
      // 남은 시간은 갑자기 줄어들지 않는다. 지금 추정보다 크게 작은 값이 두 번 맞아도
      // (예: "59"의 앞자리가 잘려 9, 8로 읽힘) 잘못 읽은 것으로 본다. 다시 써서 늘어나는 것은 받는다.
      (predicted === null || seen.seconds > predicted)
    ) {
      estimate = reading;
      pending = null;
    } else pending = reading;
    if (estimate === reading && reading.remaining > REARM_ABOVE) warned = false;
  }

  const remaining = left(estimate, now);
  let alert = false;
  if (!warned && icon.value && remaining !== null && remaining <= alertAt) alert = true;
  // 남은 시간을 전혀 모를 때만(1분 아래에서 감지를 시작한 경우 등): 버프 숫자가 사라지면(5초 전) 한 번 알린다.
  if (!warned && icon.value && remaining === null && state.number.value && !number.value)
    alert = true;
  const gone = state.icon.value && !icon.value;
  if (alertOnGone && gone && (state.alertedAt === null || now - state.alertedAt >= GONE_QUIET_MS))
    alert = true;
  if (alert) warned = true;
  const alertedAt = alert ? now : state.alertedAt;

  return {
    state: { icon, number, long, estimate, pending, warned, alertedAt },
    alert,
    remaining: remaining === null ? null : Math.max(0, remaining),
  };
}

/**
 * 화면에 보이는 시간 모양. 잘못 읽은 글자를 걸러 내려고 감지마다 받는 모양을 정해 둔다.
 * - clock: 버프·야누스·룬 "1:11", 1분 아래로 남으면 초만 "36"(1~59)  - seconds: 초 "45"(1~59)만
 */
export type TimeFormat = 'clock' | 'seconds';

/** 읽은 글자를 남은 초로 바꾼다. 숫자가 아닌 글자는 지우고, 모양이 맞지 않으면 null. */
export function parseSeconds(text: string, format: TimeFormat) {
  const t = text.replace(/[^0-9:.]/g, '');
  const clock = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (clock && format !== 'seconds')
    return Number(clock[2]) < 60 ? Number(clock[1]) * 60 + Number(clock[2]) : null;
  const whole = /^(\d{1,2})$/.exec(t);
  if (whole) {
    const n = Number(whole[1]);
    return n >= 1 && n <= 59 ? n : null;
  }
  return null;
}
