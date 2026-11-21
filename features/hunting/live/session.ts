import { z } from 'zod';

/**
 * 재획 세션과 수동 타이머. 모든 시간은 절대 시각(ms)으로 저장해
 * 새로고침하거나 탭이 뒤로 가 타이머가 늦게 돌아도 남은 시간이 맞는다.
 */
export const sessionSchema = z.object({
  startedAt: z.number().int().nonnegative(),
  pausedAt: z.number().int().nonnegative().nullable(),
  pausedMs: z.number().int().nonnegative(),
});
export type Session = z.infer<typeof sessionSchema>;

export const TIMER_MAX_MINUTES = 180;
export const timerSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().trim().min(1).max(20),
  seconds: z
    .number()
    .int()
    .min(10)
    .max(TIMER_MAX_MINUTES * 60),
  repeat: z.boolean(),
  startedAt: z.number().int().nonnegative().nullable(),
  /** 이미 알린 주기 수. 같은 주기를 두 번 알리지 않는다. */
  alerted: z.number().int().nonnegative(),
});
export type Timer = z.infer<typeof timerSchema>;

export const liveStateSchema = z.object({
  session: sessionSchema.nullable(),
  timers: z.array(timerSchema).max(12),
  sound: z.boolean(),
  volume: z.number().min(0).max(1),
});
export type LiveState = z.infer<typeof liveStateSchema>;

export const initialLiveState: LiveState = {
  session: null,
  timers: [],
  sound: true,
  volume: 0.6,
};

export const startSession = (now: number): Session => ({
  startedAt: now,
  pausedAt: null,
  pausedMs: 0,
});

export function pauseSession(s: Session, now: number): Session {
  return s.pausedAt === null ? { ...s, pausedAt: now } : s;
}

export function resumeSession(s: Session, now: number): Session {
  if (s.pausedAt === null) return s;
  return { ...s, pausedAt: null, pausedMs: s.pausedMs + Math.max(0, now - s.pausedAt) };
}

/** 일시정지한 시간을 뺀 실제 사냥 시간(ms) */
export function elapsedMs(s: Session, now: number) {
  const end = s.pausedAt ?? now;
  return Math.max(0, end - s.startedAt - s.pausedMs);
}

/** 기록 입력칸에 넣을 분. 사냥 기록 계약(1~1440분)에 맞춘다. */
export function sessionMinutes(s: Session, now: number) {
  const minutes = Math.round(elapsedMs(s, now) / 60000);
  return Math.min(1440, Math.max(1, minutes));
}

function cycles(t: Timer, now: number) {
  if (t.startedAt === null) return 0;
  const done = Math.floor(Math.max(0, now - t.startedAt) / (t.seconds * 1000));
  return t.repeat ? done : Math.min(1, done);
}

/** 남은 시간(ms). 멈춘 타이머는 null, 끝난 1회 타이머는 0 */
export function remainingMs(t: Timer, now: number) {
  if (t.startedAt === null) return null;
  const period = t.seconds * 1000;
  const passed = Math.max(0, now - t.startedAt);
  if (!t.repeat) return Math.max(0, period - passed);
  return period - (passed % period);
}

export const FRESH_MS = 60000;

/**
 * 새로 끝난 주기가 있는 타이머를 찾는다. 오래전에 끝난 것(창을 닫아 둔 사이)은
 * 소리 없이 표시만 하도록 fresh=false로 돌려준다.
 */
export function dueAlerts(timers: Timer[], now: number) {
  const due: { id: string; label: string; fresh: boolean }[] = [];
  const next = timers.map((t) => {
    const done = cycles(t, now);
    if (t.startedAt === null || done <= t.alerted) return t;
    const endedAt = t.startedAt + done * t.seconds * 1000;
    due.push({ id: t.id, label: t.label, fresh: now - endedAt < FRESH_MS });
    return { ...t, alerted: done };
  });
  return { timers: next, due };
}

export const startTimer = (t: Timer, now: number): Timer => ({ ...t, startedAt: now, alerted: 0 });
export const stopTimer = (t: Timer): Timer => ({ ...t, startedAt: null, alerted: 0 });

export function clock(ms: number) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function readLiveState(raw: string | null): LiveState {
  if (!raw) return initialLiveState;
  try {
    const parsed = liveStateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : initialLiveState;
  } catch {
    return initialLiveState;
  }
}

/** 사냥 기록 화면으로 넘기는 값. 기록 자체는 사냥 기록 화면에서 확인 후 저장한다. */
export const prefillSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  minutes: z.number().int().min(1).max(1440),
});
export type HuntPrefill = z.infer<typeof prefillSchema>;
export const PREFILL_KEY = 'maple-hunt-prefill';
export const LIVE_KEY = 'maple-hunt-live-v1';

export function readPrefill(raw: string | null): HuntPrefill | null {
  if (!raw) return null;
  try {
    const parsed = prefillSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
