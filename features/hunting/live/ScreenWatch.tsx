'use client';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '@/lib/ledger/api';
import { money } from '@/lib/ledger/format';
import { engine, manualFields, savedRegions } from '../ocr';
import { startTicker, type VoiceKind } from './notify';
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
  context,
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
  clockMask,
  glyphMask,
  nearBox,
  upperHalf,
  KEEP_RATIO,
  padMask,
  trimMask,
  matchTemplate,
  numberVisible,
  runeMarks,
  type Pixels,
} from './detectors/template';
import { initialAppear, observeAppear, type Appear } from './detectors/state';
import {
  bottomStrip,
  changedPixels,
  CHANGED_MIN,
  findExpText,
  initialIdle,
  sameFrame,
  trackIdle,
  type Box,
  type Idle,
} from './detectors/exp';
import {
  ALERT_AT,
  initialCountdown,
  RUNE_ALERT_AT,
  parseSeconds,
  track,
  type Countdown,
  type Seen,
  type TimeFormat,
} from './detectors/countdown';

const CHECK_MS = 500;
const registerKinds: WatchKind[] = ['buff', 'janus', 'rune'];
const sensitivity = [
  { label: '정확하게', value: 0.94 },
  { label: '보통', value: 0.9 },
  { label: '넉넉하게', value: 0.85 },
];

type KindInfo = { label: string; hint: string; summary: string };
const kinds: Record<WatchKind, KindInfo> = {
  buff: {
    label: '버프',
    summary: '10초 전 알림',
    hint: '먼저 게임 UI 설정에서 버프 남은 시간 표시를 "분+초"로 바꿔 주세요(아이콘 위에 2:37처럼 떠요). 버프가 켜져 있을 때 등록하세요. 버프는 모두 30분이라 하나만 등록하면 돼요. 1단계 아이콘이 보이게 대충 드래그(확대용) → 2단계 버프 아이콘 하나에 꼭 맞게 → 3단계 읽은 시간 확인. 등록 뒤에는 화면 위쪽 버프 칸 어디에 있든 알아서 찾아요.',
  },
  janus: {
    label: '야누스',
    summary: '10초 전 알림',
    hint: '야누스가 켜져 있을 때 등록하세요. 1단계 야누스 아이콘이 보이게 대충 드래그(확대용) → 2단계 야누스 아이콘에 꼭 맞게 → 3단계 읽은 시간 확인. 등록 뒤에는 화면 위쪽 버프 칸에서 알아서 찾고, 아래쪽 스킬 단축키 칸의 야누스는 보지 않아요.',
  },
  rune: {
    label: '룬',
    summary: '쿨타임 끝나면 알림',
    hint: '룬을 해방한 뒤 버프 칸에 룬 쿨타임 아이콘(4:40처럼 시간이 떠요)이 있을 때 등록하세요. 1단계 아이콘이 보이게 대충 드래그(확대용) → 2단계 룬 쿨타임 아이콘에 꼭 맞게 → 3단계 읽은 시간 확인. 쿨타임이 끝나면 "룬 쓸 수 있어요"라고 알려 줘요. 사냥터가 바뀌어도 다시 등록하지 않아도 돼요.',
  },
};
const formats: Record<WatchKind, TimeFormat> = {
  buff: 'clock',
  janus: 'clock',
  rune: 'clock',
};
/** 예전에 미니맵으로 등록한 룬(아이콘 없음). 미니맵의 룬 표시가 뜨면 알린다. */
const minimapRune = (w: Watcher) => w.kind === 'rune' && !w.icon;
/**
 * 분만 보이는 기본 표시로 예전에 등록한 버프(글자 픽셀 수 digits가 있음). 흰 분 숫자와 1분 아래 노란 초 숫자를
 * 따로 읽는다. 새로 등록하는 버프는 "분+초" 표시(2:37)를 야누스처럼 통째로 읽는다.
 */
const minuteOnly = (w: Watcher) => w.kind === 'buff' && w.digits !== undefined;
/** 아이콘을 놓쳤을 때 화면 위쪽 절반 전체를 다시 찾는 간격 */
const WIDE_MS = 2000;

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
  idle,
  onIdle,
  hunting,
  onAlert,
}: {
  capture: ScreenCapture;
  watchers: Watcher[];
  onWatchers: (next: Watcher[]) => void;
  readings: Readings;
  onReading: (next: Readings) => void;
  crops: Crops;
  onCrop: (side: 'b' | 'a', crop: string | undefined) => void;
  /** 동꼽 방지 켜짐 */
  idle: boolean;
  onIdle: (on: boolean) => void;
  /** 재획 중(일시정지 아님)일 때만 동꼽 알림을 낸다 */
  hunting: boolean;
  onAlert: (kind: VoiceKind) => void;
}) {
  const preview = useRef<HTMLVideoElement>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [trial, setTrial] = useState('');
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [idleStatus, setIdleStatus] = useState<{
    found: boolean;
    stuck: number;
    frozen: boolean;
    /** 지금 보고 있는 경험치 숫자 칸 사진(사용자가 맞는 곳인지 확인용, 이 브라우저에만 있음) */
    crop: string;
  } | null>(null);
  const huntingRef = useRef(hunting);
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
    huntingRef.current = hunting;
  }, [hunting]);

  useEffect(() => {
    if (preview.current) preview.current.srcObject = stream;
  }, [stream]);

  // 켜 둔 감지만 0.5초에 한 번, 등록한 영역만 잘라 비교한다.
  useEffect(() => {
    const enabled = watchers.filter((w) => w.enabled);
    if (!active || (!enabled.length && !idle)) return;
    // 동꼽 방지: 경험치 숫자 줄 위치(10초마다 다시 찾음), 지난 화면 조각, 멈춘 시간
    let expBox: Box | null = null;
    let expFoundAt = 0;
    let expPrev: Uint8ClampedArray | null = null;
    let expCrop = '';
    let idleState: Idle = initialIdle(Date.now());
    // 화면 공유가 새 화면을 보내는지 보려고 전체 화면을 64×36으로 줄여 비교한다.
    const thumb = document.createElement('canvas');
    thumb.width = 64;
    thumb.height = 36;
    let thumbPrev: Uint8ClampedArray | null = null;
    let busy = false;
    let stopped = false;
    const icons = new Map<string, { pixels: Pixels; art?: Uint8Array }>();
    const appear = new Map<string, Appear>();
    const counts = new Map<string, Countdown>();
    const lastRead = new Map<string, number>();
    // 버프·야누스 아이콘을 마지막으로 찾은 자리(공유 화면 기준)와 위쪽 절반 전체를 찾은 시각
    const where = new Map<string, { x: number; y: number }>();
    const wideAt = new Map<string, number>();
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
          if (!w.icon) {
            const { marks } = runeMarks(pixelsOf(frame, w.area));
            const result = observeAppear(appear.get(w.id) ?? initialAppear, marks > 0, now);
            appear.set(w.id, result.state);
            next[w.id] = {
              present: result.state.icon.value,
              remaining: null,
              detail: `흰 테두리 보라색 표시 ${marks}개`,
              note: '',
            };
            if (result.alert) alertRef.current(w.kind);
            continue;
          }

          let icon = icons.get(w.id);
          if (!icon) {
            const pixels = await iconPixels(w.icon);
            icon = {
              pixels,
              art: minuteOnly(w) && w.number ? artMask(pixels, w.number) : undefined,
            };
            icons.set(w.id, icon);
          }
          const iw = icon.pixels.width;
          const ih = icon.pixels.height;
          let search: Pixels | null = null;
          let found = { score: 0, x: 0, y: 0 };
          if (minuteOnly(w)) {
            search = pixelsOf(frame, w.area);
            found = matchTemplate(search, icon.pixels, KEEP_RATIO);
          } else {
            // 고른 영역과 관계없이 화면 위쪽 절반에서 아이콘을 찾는다. 찾은 뒤에는 그 둘레만 보고,
            // 놓치면 WIDE_MS마다 다시 위쪽 절반 전체를 찾는다.
            const top = upperHalf(frame.width, frame.height);
            const last = where.get(w.id);
            let origin: Box = top;
            if (last) {
              origin = nearBox(last, iw, ih, top);
              search = pixelsOf(frame, origin);
              found = matchTemplate(search, icon.pixels, KEEP_RATIO);
            }
            if (found.score < w.threshold && now - (wideAt.get(w.id) ?? 0) >= WIDE_MS) {
              wideAt.set(w.id, now);
              origin = top;
              search = pixelsOf(frame, top);
              found = matchTemplate(search, icon.pixels, KEEP_RATIO);
            }
            if (search && found.score >= w.threshold)
              where.set(w.id, { x: origin.x + found.x, y: origin.y + found.y });
          }
          const seen: Seen = { icon: !!search && found.score >= w.threshold };
          const left = remaining.get(w.id) ?? null;
          const due = now - (lastRead.get(w.id) ?? 0) >= (left === null || left < 25 ? 900 : 5000);
          const read = (mask: Uint8Array, mw: number, mh: number) => {
            if (reading.has(w.id)) return;
            reading.add(w.id);
            lastRead.set(w.id, now);
            readSeconds(mask, mw, mh)
              .then((text) => {
                const format = minuteOnly(w) ? 'seconds' : formats[w.kind];
                results.set(w.id, { seconds: parseSeconds(text, format), at: now });
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
          if (seen.icon && search) {
            if (minuteOnly(w) && w.number) {
              const box = { x: found.x, y: found.y, w: icon.pixels.width, h: icon.pixels.height };
              const glyph = glyphMask(search, box, icon.art);
              seen.number = numberVisible(glyph.total, w.digits ?? glyph.total);
              seen.long = glyph.total >= 4 && !glyph.yellow;
              if (glyph.yellow && due) {
                // 두 자리 초 숫자("59")는 아이콘보다 넓을 수 있어 좌우를 25% 넓혀 노란 글자만 읽는다.
                const pad = Math.round(icon.pixels.width * 0.25);
                const wide = glyphMask(
                  search,
                  { ...box, x: box.x - pad, w: box.w + pad * 2 },
                  icon.art && padMask(icon.art, box.w, box.h, pad),
                  'yellow',
                );
                const trimmed = trimMask(wide.mask, wide.w, wide.h);
                if (trimmed) read(trimmed.mask, trimmed.w, trimmed.h);
              }
            } else if (!minuteOnly(w)) {
              // 예전에 고른 숫자 칸은 쓰지 않고 아이콘 안쪽 전체에서 노란 남은 시간 글자를 읽는다.
              const { total, trimmed } = clockMask(search, {
                x: found.x,
                y: found.y,
                w: iw,
                h: ih,
              });
              if (total >= 4 && trimmed && due) read(trimmed.mask, trimmed.w, trimmed.h);
            }
          }
          const rune = w.kind === 'rune';
          const result = track(
            counts.get(w.id) ?? initialCountdown,
            seen,
            Date.now(),
            rune ? RUNE_ALERT_AT : ALERT_AT,
          );
          counts.set(w.id, result.state);
          remaining.set(w.id, result.remaining);
          next[w.id] = {
            present: result.state.icon.value,
            remaining: result.remaining,
            detail:
              (minuteOnly(w) ? '예전 방식 등록 · "분+초"로 바꾸고 다시 등록해 주세요 · ' : '') +
              (lastText.get(w.id) ? `읽은 숫자 "${lastText.get(w.id)}" · ` : '') +
              `비슷한 정도 ${Math.round(found.score * 100)}% (기준 ${Math.round(w.threshold * 100)}%)`,
            note: '',
          };
          if (result.alert) alertRef.current(rune ? 'runeReady' : w.kind);
        }
        if (idle) {
          const now = Date.now();
          const strip = bottomStrip(frame.width, frame.height);
          if (!expBox || now - expFoundAt > 10_000) {
            const found = findExpText(pixelsOf(frame, strip));
            expFoundAt = now;
            if (found?.x !== expBox?.x || found?.y !== expBox?.y || found?.w !== expBox?.w)
              expPrev = null;
            expBox = found;
            expCrop = found
              ? cropCanvas(frame, { ...found, y: found.y + strip.y }).toDataURL('image/png')
              : '';
          }
          const ctx = context(thumb);
          ctx.drawImage(frame, 0, 0, thumb.width, thumb.height);
          const small = ctx.getImageData(0, 0, thumb.width, thumb.height).data;
          const frozen = !!thumbPrev && sameFrame(thumbPrev, small);
          thumbPrev = small;
          let changed: boolean | null = null;
          if (expBox && !frozen) {
            const part = pixelsOf(frame, { ...expBox, y: expBox.y + strip.y }).data;
            changed = expPrev ? changedPixels(expPrev, part) >= CHANGED_MIN : true;
            expPrev = part;
          }
          const result = trackIdle(idleState, changed, huntingRef.current, now);
          idleState = result.state;
          setIdleStatus({
            found: !!expBox,
            stuck: now - idleState.lastChange,
            frozen,
            crop: expCrop,
          });
          if (result.alert) alertRef.current('idle');
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
  }, [active, grab, watchers, idle]);

  // 3단계에서 고른 아이콘 안쪽의 남은 시간을 바로 읽어 보여 준다(버프·야누스).
  const trialSource = draft?.iconCanvas ? draft.crop : null;
  const trialBox = draft?.iconCanvas ? draft.icon : null;
  const trialFormat: TimeFormat = draft ? formats[draft.kind] : 'clock';
  useEffect(() => {
    if (!trialSource || !trialBox) return;
    const { total, trimmed } = clockMask(whole(trialSource), trialBox);
    let cancelled = false;
    const timer = setTimeout(() => {
      if (total < 4 || !trimmed) {
        setTrial(
          '남은 시간 숫자가 안 보여요. 버프 시간 표시가 "분+초"인지, 아이콘을 꼭 맞게 골랐는지 확인해 주세요.',
        );
        return;
      }
      setTrial('읽는 중…');
      readSeconds(trimmed.mask, trimmed.w, trimmed.h)
        .then((text) => {
          if (cancelled) return;
          const seconds = parseSeconds(text, trialFormat);
          const minutes = /^\d{1,2}$/.test(text.replace(/[^0-9:.]/g, ''));
          setTrial(
            seconds !== null
              ? `읽은 시간 ${text} (${Math.round(seconds)}초)`
              : minutes
                ? `읽은 시간 ${text}분. 10분 넘게 남으면 분만 보여서, 10분 아래로 내려가면 초까지 읽어요.`
                : `"${text}"로 읽혀서 시간으로 바꾸지 못했어요. 아이콘을 다시 골라 보세요.`,
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
    if (!d.crop || !d.icon || !d.iconCanvas) return;
    const watcher = watcherSchema.safeParse({
      id: crypto.randomUUID(),
      label: d.label,
      kind: d.kind,
      frame: { w: d.frame.width, h: d.frame.height },
      area: d.area,
      icon: d.iconCanvas.toDataURL('image/png'),
      // 남은 시간은 아이콘 안쪽 전체에서 읽으므로 숫자 칸은 아이콘 전체로 저장한다(예전 저장 형식 유지).
      number: { x: 0, y: 0, w: d.icon.w, h: d.icon.h },
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

  /** 진단용: 지금 공유 화면 한 장을 이 PC에 PNG로 내려받는다. 서버로 보내지 않는다. */
  async function saveFrame() {
    const frame = await grab();
    if (!frame) return;
    const blob = await new Promise<Blob | null>((resolve) => frame.toBlob(resolve, 'image/png'));
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
    link.href = url;
    link.download = `maple-screen-${stamp}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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

  function stateText(w: Watcher, s?: Status) {
    if (!w.enabled || !active) return '꺼짐';
    if (!s) return '…';
    if (s.note) return '확인';
    if (minimapRune(w)) return s.present ? '룬 있음' : '룬 없음';
    if (w.kind === 'rune' && !s.present) return '쿨타임 없음';
    if (!s.present) return '안 보임';
    return s.remaining === null ? '보임' : `남은 ${clock(s.remaining * 1000)}`;
  }

  return (
    <>
      <section className="live-card live-area-alerts" aria-labelledby="live-alerts">
        <h2 id="live-alerts">버프·야누스·룬·동꼽 알림</h2>
        <p className="live-note">
          끝나기 10초 전에 한 번 &quot;버프 꺼져요&quot;처럼 목소리로 알려 줘요. 다시 써서 시간이
          늘어나면 알리지 않고 다음 알림만 준비해요. 룬은 쿨타임이 끝날 때 &quot;룬 쓸 수
          있어요&quot;라고 알려 줘요. 동꼽 방지는 등록하지 않아도 화면을 읽어요. 버프·야누스·룬은
          아래에서 한 번 등록해 주세요.
        </p>
        {!active && (
          <p className="live-note live-problem">
            화면 공유를 켜야 등록하고 감지할 수 있어요. 재획 시작을 누르면 함께 켜져요.
          </p>
        )}
        <ul className="live-timers">
          <li>
            <div className="live-timer-head">
              <b>동꼽 방지</b>
              <small>자동 · 경험치 바 숫자 · 5초 멈추면 &quot;캐릭터 움직이세요&quot;</small>
              <span className="live-timer-left">
                {!idle || !active
                  ? '꺼짐'
                  : !hunting
                    ? '재획 중에만'
                    : !idleStatus
                      ? '…'
                      : !idleStatus.found
                        ? '못 찾음'
                        : idleStatus.frozen
                          ? '화면 멈춤'
                          : idleStatus.stuck >= 1000
                            ? `${Math.floor(idleStatus.stuck / 1000)}초째 그대로`
                            : '오르는 중'}
              </span>
            </div>
            {idle && active && idleStatus && !idleStatus.found && (
              <small className="live-sub">
                화면 맨 아래 경험치 바 가운데 숫자를 찾지 못했어요. 게임 창 전체가 공유되는지 확인해
                주세요.
              </small>
            )}
            {idle && active && idleStatus?.frozen && (
              <small className="live-sub">
                공유 화면이 멈춰 있어서 동꼽 알림을 쉬어요. 게임 창을 최소화하지 말아 주세요.
              </small>
            )}
            {idle && active && idleStatus?.crop && (
              <span className="live-exp-crop">
                <small className="live-sub">보고 있는 칸</small>
                <Image
                  unoptimized
                  src={idleStatus.crop}
                  width={240}
                  height={20}
                  alt="동꼽 방지가 보고 있는 경험치 숫자 칸"
                />
              </span>
            )}
            <div className="live-timer-actions">
              <button type="button" onClick={() => onIdle(!idle)}>
                {idle ? '끄기' : '켜기'}
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
                  {!minimapRune(w) && (
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
              이름
              <input
                maxLength={20}
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              />
            </label>
            <p className="live-note">{kinds[draft.kind].hint}</p>
            {!draft.crop && (
              <>
                <p className="live-note">
                  <b>1단계</b> 멈춘 화면에서 아이콘이 보이게 대충 드래그하세요(최대 {AREA_MAX}×
                  {AREA_MAX}px
                  {draft.area ? `, 지금 ${draft.area.w}×${draft.area.h}px` : ''}).
                </p>
                <RegionPicker
                  source={draft.frame}
                  value={draft.area}
                  label="살펴볼 영역 고르기"
                  onChange={(area) => setDraft({ ...draft, area })}
                />
                <div className="live-actions live-left">
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
                  <button type="button" className="live-quiet" onClick={() => setDraft(null)}>
                    취소
                  </button>
                </div>
              </>
            )}
            {draft.crop && !draft.iconCanvas && (
              <>
                <p className="live-note">
                  <b>2단계</b> 확대한 영역에서 아이콘만 꼭 맞게 드래그하세요({ICON_MIN}~{ICON_MAX}px
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
            {draft.iconCanvas && (
              <>
                <p className="live-note">
                  <b>3단계</b> 아이콘 위 남은 시간을 읽어 봤어요. {trial}
                </p>
                <div className="live-zoom live-zoom-icon">
                  <Image
                    src={draft.iconCanvas.toDataURL('image/png')}
                    alt="고른 아이콘"
                    width={draft.iconCanvas.width}
                    height={draft.iconCanvas.height}
                    unoptimized
                  />
                </div>
                <div className="live-actions live-left">
                  <button type="button" className="live-primary" onClick={() => save(draft)}>
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
          등록한 아이콘과 영역을 이 브라우저 안에서만 비교해요. 화면은 저장하거나 서버로 보내지
          않고, 입력이나 게임 조작은 하지 않아요.
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
        {active && (
          <p className="live-note">
            알림이 틀리게 울리면 그때{' '}
            <button type="button" className="live-quiet" onClick={() => void saveFrame()}>
              지금 화면 저장
            </button>
            을 눌러 받은 사진을 보내 주세요. 이 PC에만 저장돼요.
          </p>
        )}

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
