'use client';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '@/lib/ledger/api';
import { money } from '@/lib/ledger/format';
import { engine, manualFields, savedRegions } from '../ocr';
import { startTicker, voiceLines, type VoiceKind } from './notify';
import { clock, type Crops, type Readings, type WatchKind, type Watcher } from './session';
import { canvasImage, context, cropCanvas, iconPixels, pixelsOf, slotCrop } from './capture/frames';
import { captureSupported, type ScreenCapture } from './capture/useScreenCapture';
import { readSeconds } from './capture/timeReader';
import {
  clockMask,
  findFixedIcon,
  FIXED_MIN,
  nearBox,
  upperHalf,
  type Pixels,
} from './detectors/template';
import {
  bottomStrip,
  changedPixels,
  CHANGED_MIN,
  findExpBar,
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
/** 버프·룬 쿨타임 아이콘을 놓쳤을 때 위쪽 절반 전체를 다시 찾는 간격(한 번에 0.1~0.2초 걸린다) */
const FIXED_WIDE_MS = 3000;
const fixedArea = { x: 0, y: 0, w: 1, h: 1 };
/**
 * 등록 없이 찾는 고정 아이콘. 사용자 게임 화면에서 잘라 낸 32×32 그림(public/)을 화면 위쪽 절반에서 찾는다.
 * 재물 획득의 비약(버프는 모두 30분이라 이것 하나로 버프 끝을 알린다), 야누스, 룬 쿨타임.
 */
const builtIns: Watcher[] = [
  {
    id: 'auto-buff',
    label: '버프 (재물 획득의 비약)',
    kind: 'buff',
    frame: fixedArea,
    area: fixedArea,
    icon: '/wealth-potion.png',
    threshold: FIXED_MIN,
    enabled: true,
  },
  {
    id: 'auto-janus',
    label: '야누스',
    kind: 'janus',
    frame: fixedArea,
    area: fixedArea,
    icon: '/janus.png',
    threshold: FIXED_MIN,
    enabled: true,
  },
  {
    id: 'auto-rune',
    label: '룬 쿨타임',
    kind: 'rune',
    frame: fixedArea,
    area: fixedArea,
    icon: '/rune-cooldown.png',
    threshold: FIXED_MIN,
    enabled: true,
  },
];
const builtIn = (w: Watcher) => w.id.startsWith('auto-');
/** 예전에 직접 등록한 알림. 이제 모두 자동으로 찾으므로 감지하지 않고 삭제를 안내한다. */
const legacy = (w: Watcher) => !builtIn(w);
const formats: Record<WatchKind, TimeFormat> = {
  buff: 'clock',
  janus: 'clock',
  rune: 'clock',
};

type Status = { present: boolean; remaining: number | null; detail: string; note: string };

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
  auto,
  onAuto,
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
  /** 등록 없이 찾는 버프(재물 획득의 비약)·야누스·룬 쿨타임 알림 켜짐 */
  auto: Record<WatchKind, boolean>;
  onAuto: (kind: WatchKind, on: boolean) => void;
  /** 재획 중(일시정지 아님)일 때만 동꼽 알림을 낸다 */
  hunting: boolean;
  onAlert: (kind: VoiceKind) => void;
}) {
  const preview = useRef<HTMLVideoElement>(null);
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

  // 켜 둔 감지만 0.5초에 한 번 공유 화면에서 찾는다.
  useEffect(() => {
    const enabled = [
      ...watchers.filter((w) => w.enabled && !legacy(w)),
      ...builtIns.filter((w) => auto[w.kind]),
    ];
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
    const icons = new Map<string, Pixels>();
    const counts = new Map<string, Countdown>();
    const lastRead = new Map<string, number>();
    // 아이콘을 마지막으로 찾은 자리(공유 화면 기준)와 위쪽 절반 전체를 찾은 시각
    const where = new Map<string, { x: number; y: number }>();
    const wideAt = new Map<string, number>();
    const remaining = new Map<string, number | null>();
    // 숫자 읽기는 오래 걸려서 감지(0.5초마다)를 막지 않도록 따로 돌리고, 결과만 다음 감지에 넘긴다.
    const reading = new Set<string>();
    const results = new Map<string, { seconds: number | null; at: number }>();
    const lastText = new Map<string, string>();
    // 아이콘 안에서 찾은 노란 시간 글자 픽셀 수(못 읽을 때 원인을 보여 주려고)
    const textPx = new Map<string, number>();

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
          if (!w.icon) continue;
          let icon = icons.get(w.id);
          if (!icon) {
            icon = await iconPixels(w.icon);
            icons.set(w.id, icon);
          }
          const iw = icon.width;
          const ih = icon.height;
          // 버프 아이콘은 반투명이라 밝기와 관계없이 그림 모양으로 찾는다.
          const match = (search: Pixels) => findFixedIcon(search, icon);
          // 화면 위쪽 절반에서 아이콘을 찾는다. 찾은 뒤에는 그 둘레만 보고, 놓치면 가끔 위쪽 절반 전체를 다시 찾는다.
          const top = upperHalf(frame.width, frame.height);
          const last = where.get(w.id);
          let search: Pixels | null = null;
          let found = { score: 0, x: 0, y: 0 };
          let origin: Box = top;
          if (last) {
            origin = nearBox(last, iw, ih, top);
            search = pixelsOf(frame, origin);
            found = match(search);
          }
          if (found.score < w.threshold && now - (wideAt.get(w.id) ?? 0) >= FIXED_WIDE_MS) {
            wideAt.set(w.id, now);
            origin = top;
            search = pixelsOf(frame, top);
            found = match(search);
          }
          if (search && found.score >= w.threshold)
            where.set(w.id, { x: origin.x + found.x, y: origin.y + found.y });
          const seen: Seen = { icon: !!search && found.score >= w.threshold };
          const left = remaining.get(w.id) ?? null;
          const due = now - (lastRead.get(w.id) ?? 0) >= (left === null || left < 25 ? 900 : 5000);
          const done = results.get(w.id);
          if (done) {
            results.delete(w.id);
            seen.seconds = done.seconds;
            seen.secondsAt = done.at;
          }
          if (seen.icon && search && due && !reading.has(w.id)) {
            // 아이콘 안쪽 전체에서 노란 남은 시간 글자("4:44")를 읽는다. 10분 넘게 남은 흰 분 숫자는 읽지 않는다.
            const { total, trimmed } = clockMask(search, { x: found.x, y: found.y, w: iw, h: ih });
            textPx.set(w.id, total);
            if (total >= 4 && trimmed) {
              reading.add(w.id);
              lastRead.set(w.id, now);
              readSeconds(trimmed.mask, trimmed.w, trimmed.h)
                .then((text) => {
                  results.set(w.id, { seconds: parseSeconds(text, formats[w.kind]), at: now });
                  lastText.set(w.id, text);
                })
                .catch(() => results.set(w.id, { seconds: null, at: now }))
                .finally(() => reading.delete(w.id));
            }
          }
          const rune = w.kind === 'rune';
          const result = track(
            counts.get(w.id) ?? initialCountdown,
            seen,
            Date.now(),
            rune ? RUNE_ALERT_AT : ALERT_AT,
            true,
          );
          counts.set(w.id, result.state);
          remaining.set(w.id, result.remaining);
          next[w.id] = {
            present: result.state.icon.value,
            remaining: result.remaining,
            detail:
              (lastText.get(w.id)
                ? `읽은 숫자 "${lastText.get(w.id)}" · `
                : textPx.has(w.id)
                  ? `노란 시간 글자 ${textPx.get(w.id)}픽셀(10분 넘게 남으면 안 떠요) · `
                  : '') +
              `비슷한 정도 ${Math.round(found.score * 100)}% (기준 ${Math.round(w.threshold * 100)}%)`,
            note: '',
          };
          if (result.alert) alertRef.current(rune ? 'runeReady' : w.kind);
        }
        if (idle) {
          const now = Date.now();
          if (!expBox || now - expFoundAt > 10_000) {
            // 연두색 경험치 바를 화면 어디서든 먼저 찾고(창 크기·해상도·전체 화면 공유와 무관),
            // 경험치가 거의 0%라 바가 짧으면 화면 아래쪽 흰 숫자 줄로 찾는다. expBox는 공유 화면 기준 좌표다.
            const strip = bottomStrip(frame.width, frame.height);
            const text = findExpText(pixelsOf(frame, strip));
            const found =
              findExpBar(pixelsOf(frame, { x: 0, y: 0, w: frame.width, h: frame.height })) ??
              (text && { ...text, y: text.y + strip.y });
            expFoundAt = now;
            if (found?.x !== expBox?.x || found?.y !== expBox?.y || found?.w !== expBox?.w)
              expPrev = null;
            expBox = found;
            // 미리보기는 숫자가 있는 가운데 부분만 보여 준다(바 전체는 너무 길다).
            const middle =
              found && found.w > 400
                ? { ...found, x: found.x + Math.round(found.w * 0.3), w: Math.round(found.w * 0.4) }
                : found;
            expCrop = middle ? cropCanvas(frame, middle).toDataURL('image/png') : '';
          }
          const ctx = context(thumb);
          ctx.drawImage(frame, 0, 0, thumb.width, thumb.height);
          const small = ctx.getImageData(0, 0, thumb.width, thumb.height).data;
          const frozen = !!thumbPrev && sameFrame(thumbPrev, small);
          thumbPrev = small;
          let changed: boolean | null = null;
          if (expBox && !frozen) {
            const part = pixelsOf(frame, expBox).data;
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
  }, [active, grab, watchers, idle, auto]);

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

  const shown = (v?: string) => (v ? money(v) : '—');

  function stateText(w: Watcher, s?: Status) {
    if (legacy(w)) return '쓰지 않음';
    if (!w.enabled || !active) return '꺼짐';
    if (!s) return '…';
    if (s.note) return '확인';
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
          있어요&quot;라고 알려 줘요. 모두 등록하지 않아도 화면 공유만 켜면 알아서 찾아요.
        </p>
        {!active && (
          <p className="live-note live-problem">
            화면 공유를 켜야 감지할 수 있어요. 재획 시작을 누르면 함께 켜져요.
          </p>
        )}
        {watchers.some(legacy) && (
          <div className="live-note live-problem" role="status">
            예전에 직접 등록한 버프·야누스·룬 알림이 남아 있어요. 이제 모두 등록 없이 자동으로
            찾으니, 예전 알림은 삭제해 주세요(예전 알림은 더 이상 울리지 않아요).{' '}
            <button type="button" onClick={() => onWatchers(watchers.filter((w) => !legacy(w)))}>
              예전 알림 모두 삭제
            </button>
          </div>
        )}
        <ul className="live-timers">
          {builtIns.map((w) => {
            const on = auto[w.kind];
            const s = status[w.id];
            return (
              <li key={w.id}>
                <div className="live-timer-head">
                  <b>{w.label}</b>
                  <small>
                    자동 ·{' '}
                    {w.kind === 'rune'
                      ? `쿨타임 끝나면 "${voiceLines.runeReady}"`
                      : `끝나기 10초 전 "${voiceLines[w.kind]}"`}
                  </small>
                  <span className="live-timer-left">{on ? stateText(w, s) : '꺼짐'}</span>
                </div>
                {on && active && s && <small className="live-sub">{s.detail}</small>}
                <div className="live-timer-actions">
                  <button type="button" onClick={() => onAuto(w.kind, !on)}>
                    {on ? '끄기' : '켜기'}
                  </button>
                </div>
              </li>
            );
          })}
          <li>
            <div className="live-timer-head">
              <b>동꼽 방지</b>
              <small>자동 · 경험치 바 · 9초 멈추면 &quot;캐릭터 움직이세요&quot;</small>
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
                  <small>예전 방식(직접 등록)</small>
                  <span className="live-timer-left">{stateText(w, s)}</span>
                </div>
                <div className="live-timer-actions">
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
