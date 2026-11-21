'use client';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '@/lib/ledger/api';
import { money } from '@/lib/ledger/format';
import { engine, manualFields, savedRegions } from '../ocr';
import { startTicker } from './notify';
import {
  AREA_MAX,
  clock,
  ICON_MAX,
  ICON_MIN,
  WATCHER_MAX,
  watcherSchema,
  type Area,
  type Crops,
  type Readings,
  type WatchKind,
  type Watcher,
} from './session';
import {
  canvasImage,
  cropCanvas,
  iconPixels,
  pixelsOf,
  sameArea,
  slotCrop,
} from './capture/frames';
import { RegionPicker } from './capture/RegionPicker';
import { captureSupported, type ScreenCapture } from './capture/useScreenCapture';
import { readSeconds } from './capture/timeReader';
import {
  artMask,
  glyphMask,
  KEEP_RATIO,
  trimMask,
  matchTemplate,
  numberVisible,
  purplePixels,
  registeredDigits,
  RUNE_PIXELS,
  type Pixels,
} from './detectors/template';
import { initialAppear, observeAppear, type Appear } from './detectors/state';
import {
  findDecimal,
  initialCountdown,
  parseSeconds,
  track,
  type Countdown,
  type Seen,
  type TimeFormat,
} from './detectors/countdown';

const CHECK_MS = 500;
/** 부스터 "남은시간" 칸은 늘 화면 위 가운데에 뜬다. 그 자리의 노란 숫자만 읽는다. */
const BOOSTER_PIXELS = 15;
const boosterRegion = (frame: HTMLCanvasElement): Area => {
  const w = Math.min(480, frame.width);
  return {
    x: Math.round((frame.width - w) / 2),
    y: 0,
    w,
    h: Math.min(200, Math.round(frame.height * 0.3)),
  };
};
/** 등록 버튼에 보이는 감지(부스터는 자동이라 뺀다) */
const registerKinds: WatchKind[] = ['buff', 'janus', 'rune'];
/** 1단계(영역 고르기)는 화면 전체로 띄워 확대해서 고른다. fit은 창 폭에 맞춤. */
const zooms: { label: string; value: 'fit' | number }[] = [
  { label: '창에 맞춤', value: 'fit' },
  { label: '원본', value: 1 },
  { label: '1.5배', value: 1.5 },
  { label: '2배', value: 2 },
  { label: '3배', value: 3 },
];
const sensitivity = [
  { label: '정확하게', value: 0.94 },
  { label: '보통', value: 0.9 },
  { label: '넉넉하게', value: 0.85 },
];

type KindInfo = { label: string; hint: string; summary: string; numberOn?: 'icon' | 'area' };
const kinds: Record<WatchKind, KindInfo> = {
  buff: {
    label: '버프',
    summary: '10초 전 알림',
    numberOn: 'icon',
    hint: '버프가 켜져 있을 때 등록하세요. 버프는 모두 30분이라 하나만 등록하면 돼요. 1단계 버프 아이콘 줄 → 2단계 버프 아이콘 하나 → 3단계 아이콘 아래 남은 시간 숫자.',
  },
  janus: {
    label: '야누스',
    summary: '10초 전 알림',
    numberOn: 'icon',
    hint: '야누스가 켜져 있을 때 등록하세요. 버프 칸에서 위치가 바뀌어도 따라가요. 1단계 버프 아이콘 줄 전체 → 2단계 야누스 아이콘 → 3단계 아이콘 위 남은 시간(예: 1:11).',
  },
  booster: {
    label: '부스터',
    summary: '10초 전 알림',
    numberOn: 'area',
    hint: '부스터가 켜져 있을 때 등록하세요. 1단계 화면 위 "남은시간" 칸 주변 → 2단계 시계 아이콘과 "남은시간" 글자 → 3단계 오른쪽 남은 시간 숫자(예: 53.73).',
  },
  rune: {
    label: '룬',
    summary: '나타나면 알림',
    hint: '미니맵만 드래그하면 돼요. 미니맵에 보라색 룬 표시가 뜨면 알려 줘요.',
  },
};
const formats: Record<WatchKind, TimeFormat> = {
  buff: 'seconds',
  janus: 'clock',
  booster: 'decimal',
  rune: 'seconds',
};
/** 숫자 칸을 조금 좁게 골라도 읽히도록 둘레를 넓혀 읽는다(색으로 거르므로 배경은 들어오지 않는다). */
const MARGIN = 3;
const widen = (b: Area) => ({
  x: b.x - MARGIN,
  y: b.y - MARGIN,
  w: b.w + MARGIN * 2,
  h: b.h + MARGIN * 2,
});
const spoken = (w: Watcher) => `${w.label} ${w.kind === 'rune' ? '떴어요' : '꺼져요'}`;

type Draft = {
  frame: HTMLCanvasElement;
  label: string;
  kind: WatchKind;
  area: Area | null;
  crop: HTMLCanvasElement | null;
  icon: Area | null;
  iconCanvas: HTMLCanvasElement | null;
  number: Area | null;
};
type Status = { present: boolean; remaining: number | null; detail: string; note: string };

const whole = (canvas: HTMLCanvasElement) =>
  pixelsOf(canvas, { x: 0, y: 0, w: canvas.width, h: canvas.height });

export function ScreenWatch({
  capture,
  watchers,
  onWatchers,
  readings,
  onReading,
  crops,
  onCrop,
  booster,
  onBooster,
  onAlert,
}: {
  capture: ScreenCapture;
  watchers: Watcher[];
  onWatchers: (next: Watcher[]) => void;
  readings: Readings;
  onReading: (next: Readings) => void;
  crops: Crops;
  onCrop: (side: 'b' | 'a', crop: string | undefined) => void;
  booster: boolean;
  onBooster: (on: boolean) => void;
  onAlert: (text: string) => void;
}) {
  const preview = useRef<HTMLVideoElement>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [trial, setTrial] = useState('');
  const [zoom, setZoom] = useState<'fit' | number>(1.5);
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [boosterStatus, setBoosterStatus] = useState<{
    present: boolean;
    remaining: number | null;
    text: string;
  } | null>(null);
  const [cost, setCost] = useState<number | null>(null);
  const [reading, setReading] = useState('');
  const [problem, setProblem] = useState('');
  // 서버 렌더와 첫 화면이 같도록 지원 여부는 화면이 뜬 뒤에 확인한다.
  const [supported, setSupported] = useState(true);
  const alertRef = useRef(onAlert);
  const { active, grab, stream } = capture;

  useEffect(() => {
    const timer = setTimeout(() => setSupported(captureSupported()), 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    alertRef.current = onAlert;
  }, [onAlert]);

  useEffect(() => {
    if (preview.current) preview.current.srcObject = stream;
  }, [stream]);

  // 켜 둔 감지만 0.5초에 한 번, 등록한 영역만 잘라 비교한다.
  useEffect(() => {
    const enabled = watchers.filter((w) => w.enabled);
    if (!active || (!enabled.length && !booster)) return;
    let busy = false;
    let stopped = false;
    const icons = new Map<string, { pixels: Pixels; art?: Uint8Array }>();
    const appear = new Map<string, Appear>();
    const counts = new Map<string, Countdown>();
    const lastRead = new Map<string, number>();
    const remaining = new Map<string, number | null>();
    // 숫자 읽기는 오래 걸려서 감지(0.5초마다)를 막지 않도록 따로 돌리고, 결과만 다음 감지에 넘긴다.
    const reading = new Set<string>();
    const results = new Map<string, { seconds: number | null; at: number }>();
    const lastText = new Map<string, string>();

    const tick = async () => {
      if (busy || stopped) return;
      busy = true;
      try {
        const frame = await grab();
        if (!frame || stopped) return;
        const began = performance.now();
        const next: Record<string, Status> = {};
        for (const w of enabled) {
          const now = Date.now();
          if (
            frame.width !== w.frame.w ||
            frame.height !== w.frame.h ||
            !sameArea(w.area, w.frame)
          ) {
            next[w.id] = {
              present: false,
              remaining: null,
              detail: '',
              note: '화면 크기가 달라요. 다시 등록해 주세요.',
            };
            continue;
          }
          const search = pixelsOf(frame, w.area);

          if (w.kind === 'rune' || !w.icon) {
            const count = purplePixels(search);
            const result = observeAppear(
              appear.get(w.id) ?? initialAppear,
              count >= RUNE_PIXELS,
              now,
            );
            appear.set(w.id, result.state);
            next[w.id] = {
              present: result.state.icon.value,
              remaining: null,
              detail: `보라색 ${count}px`,
              note: '',
            };
            if (result.alert) alertRef.current(spoken(w));
            continue;
          }

          let icon = icons.get(w.id);
          if (!icon) {
            const pixels = await iconPixels(w.icon);
            icon = {
              pixels,
              art: w.kind === 'buff' && w.number ? artMask(pixels, w.number) : undefined,
            };
            icons.set(w.id, icon);
          }
          const found = matchTemplate(search, icon.pixels, w.kind === 'booster' ? 1 : KEEP_RATIO);
          const seen: Seen = { icon: found.score >= w.threshold };
          const left = remaining.get(w.id) ?? null;
          const due = now - (lastRead.get(w.id) ?? 0) >= (left === null || left < 25 ? 900 : 5000);
          const read = (mask: Uint8Array, mw: number, mh: number) => {
            if (reading.has(w.id)) return;
            reading.add(w.id);
            lastRead.set(w.id, now);
            readSeconds(mask, mw, mh)
              .then((text) => {
                results.set(w.id, { seconds: parseSeconds(text, formats[w.kind]), at: now });
                lastText.set(w.id, text);
              })
              .catch(() => results.set(w.id, { seconds: null, at: now }))
              .finally(() => reading.delete(w.id));
          };
          const done = results.get(w.id);
          if (done) {
            results.delete(w.id);
            seen.seconds = done.seconds;
            seen.secondsAt = done.at;
          }
          if (seen.icon && w.number) {
            if (w.kind === 'buff') {
              const box = { x: found.x, y: found.y, w: icon.pixels.width, h: icon.pixels.height };
              const glyph = glyphMask(search, box, icon.art);
              seen.number = numberVisible(glyph.total, w.digits ?? glyph.total);
              if (glyph.total >= 4 && !glyph.yellow) seen.long = true;
              else if (glyph.yellow && due) read(glyph.mask, glyph.w, glyph.h);
            } else {
              const box = widen({ ...w.number, x: found.x + w.number.x, y: found.y + w.number.y });
              const glyph = glyphMask(search, box);
              if (glyph.total >= 4 && due) read(glyph.mask, glyph.w, glyph.h);
            }
          }
          const result = track(counts.get(w.id) ?? initialCountdown, seen, Date.now());
          counts.set(w.id, result.state);
          remaining.set(w.id, result.remaining);
          next[w.id] = {
            present: result.state.icon.value,
            remaining: result.remaining,
            detail:
              (lastText.get(w.id) ? `읽은 숫자 "${lastText.get(w.id)}" · ` : '') +
              `비슷한 정도 ${Math.round(found.score * 100)}% (기준 ${Math.round(w.threshold * 100)}%)`,
            note: '',
          };
          if (result.alert) alertRef.current(spoken(w));
        }
        if (booster) {
          const id = 'booster';
          const now = Date.now();
          const region = boosterRegion(frame);
          const search = pixelsOf(frame, region);
          const glyph = glyphMask(search, { ...region, x: 0, y: 0 }, undefined, 'yellow');
          const seen: Seen = { icon: glyph.total >= BOOSTER_PIXELS };
          const done = results.get(id);
          if (done) {
            results.delete(id);
            seen.seconds = done.seconds;
            seen.secondsAt = done.at;
          }
          const left = remaining.get(id) ?? null;
          const due = now - (lastRead.get(id) ?? 0) >= (left === null || left < 25 ? 900 : 5000);
          const trimmed = seen.icon ? trimMask(glyph.mask, glyph.w, glyph.h) : null;
          if (trimmed && due && !reading.has(id)) {
            reading.add(id);
            lastRead.set(id, now);
            readSeconds(trimmed.mask, trimmed.w, trimmed.h, true)
              .then((text) => {
                results.set(id, { seconds: findDecimal(text), at: now });
                lastText.set(id, text.replace(/\s+/g, ' '));
              })
              .catch(() => results.set(id, { seconds: null, at: now }))
              .finally(() => reading.delete(id));
          }
          const result = track(counts.get(id) ?? initialCountdown, seen, Date.now());
          counts.set(id, result.state);
          remaining.set(id, result.remaining);
          setBoosterStatus({
            present: result.state.icon.value,
            remaining: result.remaining,
            text: lastText.get(id) ?? '',
          });
          if (result.alert) alertRef.current('부스터 꺼져요');
        }
        if (stopped) return;
        setCost(Math.round(performance.now() - began));
        setStatus(next);
      } catch (e) {
        setProblem(errorMessage(e));
      } finally {
        busy = false;
      }
    };
    const stop = startTicker(() => void tick(), CHECK_MS);
    return () => {
      stopped = true;
      stop();
    };
  }, [active, grab, watchers, booster]);

  // 3단계에서 고른 숫자 칸을 바로 읽어 보여 준다(야누스·부스터).
  const trialSource =
    draft && draft.kind !== 'buff' && draft.iconCanvas
      ? kinds[draft.kind].numberOn === 'area'
        ? draft.crop
        : draft.iconCanvas
      : null;
  const trialBox = draft?.number ?? null;
  const trialFormat: TimeFormat = draft ? formats[draft.kind] : 'clock';
  useEffect(() => {
    if (!trialSource || !trialBox) return;
    const glyph = glyphMask(whole(trialSource), widen(trialBox));
    let cancelled = false;
    const timer = setTimeout(() => {
      if (glyph.total < 4) {
        setTrial('숫자가 잘 안 보여요. 숫자를 조금 넉넉히 감싸 보세요.');
        return;
      }
      setTrial('읽는 중…');
      readSeconds(glyph.mask, glyph.w, glyph.h)
        .then((text) => {
          if (cancelled) return;
          const seconds = parseSeconds(text, trialFormat);
          setTrial(
            seconds === null
              ? `"${text}"로 읽혀서 시간으로 바꾸지 못했어요. 숫자를 다시 감싸 보세요.`
              : `읽은 시간 ${text} (${Math.round(seconds)}초)`,
          );
        })
        .catch((e) => {
          if (!cancelled) setTrial(errorMessage(e));
        });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trialSource, trialBox, trialFormat]);

  const picking = !!draft && !draft.crop;
  useEffect(() => {
    if (!picking) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDraft(null);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [picking]);

  async function begin(kind: WatchKind) {
    setProblem('');
    setTrial('');
    if (watchers.length >= WATCHER_MAX) {
      setProblem(`알림은 ${WATCHER_MAX}개까지 등록할 수 있어요.`);
      return;
    }
    const frame = await grab();
    if (!frame) {
      setProblem('화면을 아직 받지 못했어요. 잠시 뒤 다시 눌러 주세요.');
      return;
    }
    const still = cropCanvas(frame, { x: 0, y: 0, w: frame.width, h: frame.height });
    setDraft({
      frame: still,
      label: kinds[kind].label,
      kind,
      area: null,
      crop: null,
      icon: null,
      iconCanvas: null,
      number: null,
    });
  }

  function save(d: Draft) {
    if (!d.area) return;
    const rune = d.kind === 'rune';
    if (!rune && (!d.crop || !d.icon || !d.iconCanvas || !d.number)) return;
    const onArea = kinds[d.kind].numberOn === 'area';
    const number =
      d.number && d.icon
        ? onArea
          ? { ...d.number, x: d.number.x - d.icon.x, y: d.number.y - d.icon.y }
          : d.number
        : undefined;
    const watcher = watcherSchema.safeParse({
      id: crypto.randomUUID(),
      label: d.label,
      kind: d.kind,
      frame: { w: d.frame.width, h: d.frame.height },
      area: d.area,
      icon: rune ? undefined : d.iconCanvas?.toDataURL('image/png'),
      number: rune ? undefined : number,
      digits:
        d.kind === 'buff' && d.iconCanvas && d.number
          ? registeredDigits(whole(d.iconCanvas), d.number) || undefined
          : undefined,
      threshold: 0.9,
      enabled: true,
    });
    if (!watcher.success) {
      setProblem('이름(20자 이내)과 고른 영역을 확인해 주세요.');
      return;
    }
    onWatchers([...watchers, watcher.data]);
    setDraft(null);
    setTrial('');
  }

  async function snapshot(side: 'b' | 'a') {
    setProblem('');
    const frame = await grab();
    if (!frame) return;
    const { image, release } = await canvasImage(frame);
    try {
      setReading('화면에서 메소·조각 칸을 찾는 중…');
      const ocr = await engine();
      const fields = await ocr.detect(image);
      const result = await ocr.read(image, fields, setReading);
      const clean = (v: string | null) => {
        const n = v?.replace(/\D/g, '') ?? '';
        return /^\d{1,16}$/.test(n) ? n : undefined;
      };
      const meso = clean(result.meso);
      const fragment = result.fragmentIssue ? undefined : clean(result.fragment);
      onReading(side === 'b' ? { bm: meso, bf: fragment } : { am: meso, af: fragment });
      // 조각 개수를 못 읽으면 조각 칸 사진을 남겨 사용자가 보고 입력하게 한다.
      const slot = fragment
        ? null
        : (fields.fragment ?? manualFields(image, savedRegions()).fragment);
      onCrop(side, slot ? slotCrop(image, slot) : undefined);
      setReading(
        meso && fragment
          ? '읽었어요. 기록 화면에서 숫자를 한 번 더 확인해 주세요.'
          : !fragment && slot
            ? '조각 개수를 못 읽어서 조각 칸 사진을 남겨 뒀어요. 사진을 보고 개수를 입력해 주세요.'
            : '일부 칸을 읽지 못했어요. 인벤토리의 메소와 기타 탭 첫 칸이 보이는지 확인해 주세요.',
      );
    } catch (e) {
      setReading(errorMessage(e));
      if (window.MapleOCR) await window.MapleOCR.resetWorkers();
    } finally {
      release();
    }
  }

  const areaOk = (a: Area | null) =>
    !!a && a.w <= AREA_MAX && a.h <= AREA_MAX && a.w >= 12 && a.h >= 12;
  const iconOk = (a: Area | null) =>
    !!a && a.w >= ICON_MIN && a.h >= ICON_MIN && a.w <= ICON_MAX && a.h <= ICON_MAX;
  const shown = (v?: string) => (v ? money(v) : '—');
  const buffDigits =
    draft?.kind === 'buff' && draft.iconCanvas && draft.number
      ? registeredDigits(whole(draft.iconCanvas), draft.number)
      : 0;
  const runeNow =
    draft?.kind === 'rune' && draft.area && areaOk(draft.area)
      ? purplePixels(pixelsOf(draft.frame, draft.area))
      : 0;
  const step3Source = draft
    ? kinds[draft.kind].numberOn === 'area'
      ? draft.crop
      : draft.iconCanvas
    : null;

  function stateText(w: Watcher, s?: Status) {
    if (!w.enabled || !active) return '꺼짐';
    if (!s) return '…';
    if (s.note) return '확인';
    if (w.kind === 'rune') return s.present ? '룬 있음' : '룬 없음';
    if (!s.present) return '안 보임';
    return s.remaining === null ? '보임' : `남은 ${clock(s.remaining * 1000)}`;
  }

  return (
    <>
      <section className="live-card live-area-alerts" aria-labelledby="live-alerts">
        <h2 id="live-alerts">버프·야누스·부스터·룬 알림</h2>
        <p className="live-note">
          끝나기 10초 전에 한 번 &quot;버프 꺼져요&quot;처럼 음성으로 알려 줘요. 다시 써서 시간이
          늘어나면 알리지 않고 다음 알림만 준비해요. 부스터는 등록하지 않아도 화면 위 가운데
          &quot;남은시간&quot;을 읽어요. 버프·야누스·룬은 아래에서 한 번 등록해 주세요.
        </p>
        {!active && (
          <p className="live-note live-problem">
            화면 공유를 켜야 등록하고 감지할 수 있어요. 재획 시작을 누르면 함께 켜져요.
          </p>
        )}
        <ul className="live-timers">
          <li>
            <div className="live-timer-head">
              <b>부스터</b>
              <small>자동 · 화면 위 가운데 &quot;남은시간&quot; · 10초 전 알림</small>
              <span className="live-timer-left">
                {!booster || !active
                  ? '꺼짐'
                  : !boosterStatus
                    ? '…'
                    : !boosterStatus.present || boosterStatus.remaining === 0
                      ? '없음'
                      : boosterStatus.remaining === null
                        ? '보임'
                        : `남은 ${clock(boosterStatus.remaining * 1000)}`}
              </span>
            </div>
            {booster && active && boosterStatus?.present && boosterStatus.text && (
              <small className="live-sub">읽은 숫자 &quot;{boosterStatus.text}&quot;</small>
            )}
            <div className="live-timer-actions">
              <button type="button" onClick={() => onBooster(!booster)}>
                {booster ? '끄기' : '켜기'}
              </button>
            </div>
          </li>
          {watchers.map((w) => {
            const s = status[w.id];
            return (
              <li key={w.id}>
                <div className="live-timer-head">
                  <b>{w.label}</b>
                  <small>{kinds[w.kind].summary}</small>
                  <span className="live-timer-left">{stateText(w, s)}</span>
                </div>
                {s && active && w.enabled && (
                  <small className="live-sub">{s.note || s.detail}</small>
                )}
                <div className="live-timer-actions">
                  {w.kind !== 'rune' && (
                    <label className="live-inline">
                      민감도
                      <select
                        value={w.threshold}
                        onChange={(e) =>
                          onWatchers(
                            watchers.map((x) =>
                              x.id === w.id ? { ...x, threshold: Number(e.target.value) } : x,
                            ),
                          )
                        }
                      >
                        {sensitivity.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      onWatchers(
                        watchers.map((x) => (x.id === w.id ? { ...x, enabled: !x.enabled } : x)),
                      )
                    }
                  >
                    {w.enabled ? '끄기' : '켜기'}
                  </button>
                  <button
                    type="button"
                    className="live-quiet"
                    onClick={() => onWatchers(watchers.filter((x) => x.id !== w.id))}
                  >
                    삭제
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        {!draft && (
          <div className="live-presets">
            {registerKinds.map((kind) => (
              <button key={kind} type="button" disabled={!active} onClick={() => void begin(kind)}>
                + {kinds[kind].label} 등록
              </button>
            ))}
          </div>
        )}

        {draft && (
          <div className="live-register">
            <label className="live-register-name">
              이름 (알림에서 &quot;{draft.label} {draft.kind === 'rune' ? '떴어요' : '꺼져요'}
              &quot;로 읽어요)
              <input
                maxLength={20}
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              />
            </label>
            <p className="live-note">{kinds[draft.kind].hint}</p>
            {!draft.crop && (
              <div
                className="live-overlay"
                role="dialog"
                aria-modal="true"
                aria-label="영역 고르기"
              >
                <div className="live-overlay-bar">
                  <p className="live-note">
                    <b>1단계</b> 멈춘 화면에서{' '}
                    {draft.kind === 'rune' ? '미니맵을' : '살펴볼 영역을'} 드래그하세요(최대{' '}
                    {AREA_MAX}×{AREA_MAX}px
                    {draft.area ? `, 지금 ${draft.area.w}×${draft.area.h}px` : ''}).
                    {draft.kind === 'rune' && draft.area
                      ? ` 지금 보라색 ${runeNow}px${runeNow >= RUNE_PIXELS ? ' · 룬 있음' : ''}.`
                      : ''}{' '}
                    확대한 뒤 스크롤해서 찾을 수 있어요.
                  </p>
                  <div className="live-zooms" role="group" aria-label="확대">
                    {zooms.map((z) => (
                      <button
                        key={z.label}
                        type="button"
                        aria-pressed={zoom === z.value}
                        onClick={() => setZoom(z.value)}
                      >
                        {z.label}
                      </button>
                    ))}
                  </div>
                  <div className="live-actions live-left">
                    {draft.kind === 'rune' ? (
                      <button
                        type="button"
                        className="live-primary"
                        disabled={!areaOk(draft.area)}
                        onClick={() => save(draft)}
                      >
                        등록
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="live-primary"
                        disabled={!areaOk(draft.area)}
                        onClick={() =>
                          draft.area &&
                          setDraft({ ...draft, crop: cropCanvas(draft.frame, draft.area) })
                        }
                      >
                        다음
                      </button>
                    )}
                    <button type="button" className="live-quiet" onClick={() => setDraft(null)}>
                      취소 (Esc)
                    </button>
                  </div>
                </div>
                <div className="live-overlay-body">
                  <RegionPicker
                    source={draft.frame}
                    value={draft.area}
                    label="살펴볼 영역 고르기"
                    width={zoom === 'fit' ? undefined : Math.round(draft.frame.width * zoom)}
                    onChange={(area) => setDraft({ ...draft, area })}
                  />
                </div>
              </div>
            )}
            {draft.crop && !draft.iconCanvas && (
              <>
                <p className="live-note">
                  <b>2단계</b> 확대한 영역에서{' '}
                  {draft.kind === 'booster' ? '시계 아이콘과 "남은시간" 글자를' : '아이콘만'} 꼭
                  맞게 드래그하세요({ICON_MIN}~{ICON_MAX}px
                  {draft.icon ? `, 지금 ${draft.icon.w}×${draft.icon.h}px` : ''}).
                </p>
                <div className="live-zoom">
                  <RegionPicker
                    source={draft.crop}
                    value={draft.icon}
                    label="아이콘 고르기"
                    onChange={(icon) => setDraft({ ...draft, icon })}
                  />
                </div>
                <div className="live-actions live-left">
                  <button
                    type="button"
                    className="live-primary"
                    disabled={!iconOk(draft.icon)}
                    onClick={() =>
                      draft.crop &&
                      draft.icon &&
                      setDraft({ ...draft, iconCanvas: cropCanvas(draft.crop, draft.icon) })
                    }
                  >
                    다음
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraft({ ...draft, crop: null, icon: null })}
                  >
                    영역 다시 고르기
                  </button>
                  <button type="button" className="live-quiet" onClick={() => setDraft(null)}>
                    취소
                  </button>
                </div>
              </>
            )}
            {draft.iconCanvas && step3Source && (
              <>
                <p className="live-note">
                  <b>3단계</b> 남은 시간 숫자를 드래그하세요.
                  {draft.kind === 'buff'
                    ? ' 아이콘 아래쪽 분 숫자(예: 30)를 고르면, 1분 아래로 가서 가운데 노란 초 숫자로 바뀌어도 따라가요.'
                    : ''}
                  {draft.kind === 'buff' && draft.number
                    ? buffDigits >= 4
                      ? ` (글자 픽셀 ${buffDigits}개 확인)`
                      : ' (숫자가 잘 안 보여요. 숫자를 조금 넉넉히 감싸 보세요.)'
                    : ''}
                  {draft.kind !== 'buff' && draft.number && trial ? ` ${trial}` : ''}
                </p>
                <div
                  className={draft.kind === 'booster' ? 'live-zoom' : 'live-zoom live-zoom-icon'}
                >
                  <RegionPicker
                    source={step3Source}
                    value={draft.number}
                    label="남은 시간 숫자 고르기"
                    onChange={(number) => setDraft({ ...draft, number })}
                  />
                </div>
                <div className="live-actions live-left">
                  <button
                    type="button"
                    className="live-primary"
                    disabled={!draft.number || (draft.kind === 'buff' && buffDigits < 4)}
                    onClick={() => save(draft)}
                  >
                    등록
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraft({ ...draft, iconCanvas: null, number: null })}
                  >
                    아이콘 다시 고르기
                  </button>
                  <button type="button" className="live-quiet" onClick={() => setDraft(null)}>
                    취소
                  </button>
                </div>
              </>
            )}
          </div>
        )}
        {problem && (
          <p className="live-note live-problem" role="status">
            {problem}
          </p>
        )}
      </section>

      <section className="live-card live-area-share" aria-labelledby="live-screen">
        <h2 id="live-screen">화면 공유</h2>
        <p className="live-note">
          등록한 영역만 이 브라우저 안에서 비교해요. 화면은 저장하거나 서버로 보내지 않고, 입력이나
          게임 조작은 하지 않아요.
        </p>
        {!supported ? (
          <p className="live-note live-problem">
            이 브라우저는 화면 공유를 지원하지 않아요. PC의 Chrome이나 Edge에서 열어 주세요.
          </p>
        ) : (
          <div className="live-actions live-left">
            {active ? (
              <button type="button" onClick={capture.stop}>
                공유 중지
              </button>
            ) : (
              <button type="button" onClick={() => void capture.start()}>
                게임 화면 공유
              </button>
            )}
            {active && (
              <span className="live-badge">공유 중{cost !== null ? ` · 분석 ${cost}ms` : ''}</span>
            )}
          </div>
        )}
        {capture.error && <p className="live-note live-problem">{capture.error}</p>}
        {active && <video ref={preview} className="live-preview" muted playsInline autoPlay />}
        <p className="live-note">
          게임은 창 모드나 테두리 없는 창 모드로 두고, 공유 창에서 메이플스토리 창을 골라 주세요.
        </p>

        <h3>메소·조각 스냅샷</h3>
        <p className="live-note">
          인벤토리를 열어 메소와 기타 탭 첫 칸(솔 에르다 조각)이 보이게 한 뒤 눌러요.
        </p>
        <div className="live-actions live-left">
          <button type="button" disabled={!active} onClick={() => void snapshot('b')}>
            사냥 전 읽기
          </button>
          <button type="button" disabled={!active} onClick={() => void snapshot('a')}>
            사냥 후 읽기
          </button>
        </div>
        <dl className="live-readings">
          {(['b', 'a'] as const).map((side) => {
            const meso = side === 'b' ? readings.bm : readings.am;
            const fragment = side === 'b' ? readings.bf : readings.af;
            const crop = crops[side];
            const name = side === 'b' ? '사냥 전' : '사냥 후';
            return (
              <div key={side}>
                <dt>{name}</dt>
                <dd>
                  {shown(meso)} 메소 · {shown(fragment)} 개
                  {crop && (
                    <span className="live-crop">
                      <Image
                        unoptimized
                        loading="eager"
                        src={crop}
                        width={240}
                        height={160}
                        alt={`${name} 솔 에르다 조각 칸`}
                      />
                      <label>
                        조각 개수
                        <input
                          inputMode="numeric"
                          maxLength={9}
                          value={fragment ?? ''}
                          placeholder="사진 보고 입력"
                          onChange={(e) => {
                            const n = e.target.value.replace(/\D/g, '');
                            onReading(
                              side === 'b' ? { bf: n || undefined } : { af: n || undefined },
                            );
                          }}
                        />
                      </label>
                    </span>
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
        {reading && (
          <p className="live-note" role="status">
            {reading}
          </p>
        )}
      </section>
    </>
  );
}
