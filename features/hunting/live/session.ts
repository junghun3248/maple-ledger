import { z } from 'zod';

/**
 * 재획 세션과 화면 감지 설정. 시간은 절대 시각(ms)으로 저장해
 * 새로고침하거나 탭이 뒤로 가도 사냥 시간이 맞는다.
 */
export const sessionSchema = z.object({
  startedAt: z.number().int().nonnegative(),
  pausedAt: z.number().int().nonnegative().nullable(),
  pausedMs: z.number().int().nonnegative(),
});
export type Session = z.infer<typeof sessionSchema>;

const areaSchema = z.object({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
});
export type Area = z.infer<typeof areaSchema>;
export const AREA_MAX = 480;

export const watchKinds = ['buff', 'janus', 'rune'] as const;
export type WatchKind = (typeof watchKinds)[number];

/** 아이콘 기준 숫자 칸 */
const offsetSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
});

/**
 * 화면 감지 등록 정보. 사용자가 자기 공유 화면에서 고른 영역과 아이콘 조각이며 이 브라우저에만 저장한다.
 * - area: 공유 화면 기준 픽셀. 룬은 미니맵, 나머지는 아이콘을 찾을 범위다.
 * - icon: 영역 안에서 잘라 낸 PNG(룬은 없음). number: 아이콘 기준 남은 시간 숫자 칸.
 * - digits: 분만 보이는 기본 표시로 예전에 등록한 버프의 글자 픽셀 수. 새 버프("분+초" 표시)는 없다.
 * 2단계 초기 저장값(kind 없이 mode만 있음)은 읽을 때 kind로 바꾼다.
 */
export const watcherSchema = z.preprocess(
  (value) => {
    if (!value || typeof value !== 'object' || 'kind' in value) return value;
    const mode = 'mode' in value ? value.mode : undefined;
    const number = 'number' in value ? value.number : undefined;
    return { ...value, kind: mode === 'appear' ? 'rune' : number ? 'buff' : 'booster' };
  },
  z.object({
    id: z.string().min(1).max(64),
    label: z.string().trim().min(1).max(20),
    kind: z.enum(watchKinds),
    frame: z.object({ w: z.number().int().positive(), h: z.number().int().positive() }),
    area: areaSchema.refine((a) => a.w <= AREA_MAX && a.h <= AREA_MAX),
    icon: z.string().startsWith('data:image/png;base64,').max(40000).optional(),
    number: offsetSchema.optional(),
    digits: z.number().int().positive().optional(),
    threshold: z.number().min(0.5).max(0.99),
    enabled: z.boolean(),
  }),
);
export type Watcher = z.infer<typeof watcherSchema>;

function isBooster(value: unknown) {
  if (!value || typeof value !== 'object') return false;
  if ('kind' in value) return value.kind === 'booster';
  return !('number' in value && value.number) && !('mode' in value && value.mode === 'appear');
}
export const WATCHER_MAX = 8;

const digits = z.string().regex(/^\d{1,16}$/);
/** 공유 화면 스냅샷에서 읽은 사냥 전(b)·후(a) 메소(m)·솔 에르다 조각(f) */
export const readingsSchema = z.object({
  bm: digits.optional(),
  bf: digits.optional(),
  am: digits.optional(),
  af: digits.optional(),
});
export type Readings = z.infer<typeof readingsSchema>;

/** 조각 개수를 못 읽었을 때 남겨 두는 조각 칸 확대 사진(사냥 전 b·후 a). 이 브라우저에만 저장한다. */
const cropSchema = z.string().startsWith('data:image/png;base64,').max(300000);
export const cropsSchema = z.object({ b: cropSchema.optional(), a: cropSchema.optional() });
export type Crops = z.infer<typeof cropsSchema>;

export const liveStateSchema = z.object({
  session: sessionSchema.nullable(),
  sound: z.boolean(),
  volume: z.number().min(0).max(1),
  // 부스터 알림은 없앴다. 예전에 등록한 부스터(숫자 칸 없는 옛 저장값 포함)는 읽을 때 버린다.
  watchers: z.preprocess(
    (value) => (Array.isArray(value) ? value.filter((w) => !isBooster(w)) : value),
    z.array(watcherSchema).max(WATCHER_MAX).default([]),
  ),
  readings: readingsSchema.default({}),
  crops: cropsSchema.default({}),
  /** 동꼽 방지(경험치 바가 9초 넘게 그대로면 알림) */
  idle: z.boolean().default(true),
  /** 등록 없이 찾는 버프(재물 획득의 비약)·야누스·룬 쿨타임 알림 */
  autoBuff: z.boolean().default(true),
  autoJanus: z.boolean().default(true),
  autoRune: z.boolean().default(true),
});
export type LiveState = z.infer<typeof liveStateSchema>;

export const initialLiveState: LiveState = {
  session: null,
  sound: true,
  volume: 0.6,
  watchers: [],
  readings: {},
  crops: {},
  idle: true,
  autoBuff: true,
  autoJanus: true,
  autoRune: true,
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

export function clock(ms: number) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** 예전 저장값(수동 타이머 포함)도 읽는다. 모르는 항목은 버린다. */
export function readLiveState(raw: string | null): LiveState {
  if (!raw) return initialLiveState;
  try {
    const parsed = liveStateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : initialLiveState;
  } catch {
    return initialLiveState;
  }
}

/** 재획을 끝내면 기록 입력칸에 채우는 값. 기록 자체는 사용자가 확인한 뒤 저장한다. */
export const prefillSchema = readingsSchema.extend({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  minutes: z.number().int().min(1).max(1440),
});
export type HuntPrefill = z.infer<typeof prefillSchema>;
export const LIVE_KEY = 'maple-hunt-live-v1';
