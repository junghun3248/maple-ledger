'use client';
import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '@/lib/ledger/api';
import { money } from '@/lib/ledger/format';
import { engine } from '../ocr';
import { startTicker } from './notify';
import {
  AREA_MAX,
  ICON_MAX,
  ICON_MIN,
  WATCHER_MAX,
  watcherSchema,
  type Area,
  type Readings,
  type Watcher,
} from './session';
import { canvasImage, cropCanvas, iconPixels, pixelsOf, sameArea } from './capture/frames';
import { RegionPicker } from './capture/RegionPicker';
import { captureSupported, type ScreenCapture } from './capture/useScreenCapture';
import {
  artMask,
  KEEP_RATIO,
  matchTemplate,
  numberPixels,
  numberVisible,
  registeredDigits,
  type Pixels,
} from './detectors/template';
import {
  initialPresence,
  observe,
  type Presence,
  type WatchAlert,
  type WatchMode,
} from './detectors/state';

const CHECK_MS = 500;
const sensitivity = [
  { label: '정확하게', value: 0.94 },
  { label: '보통', value: 0.9 },
  { label: '넉넉하게', value: 0.85 },
];
type Kind = 'buff' | 'booster' | 'rune';
const kinds: { kind: Kind; label: string; mode: WatchMode; hint: string }[] = [
  {
    kind: 'buff',
    label: '버프',
    mode: 'disappear',
    hint: '버프가 켜져 있을 때 등록하세요. 버프는 모두 30분이라 하나만 등록하면 돼요. 1단계 버프 아이콘 줄 → 2단계 버프 아이콘 하나 → 3단계 아이콘 아래 남은 시간 숫자.',
  },
  {
    kind: 'booster',
    label: '부스터',
    mode: 'disappear',
    hint: '부스터가 켜져 있을 때 등록하세요. 1단계 화면 위 "남은시간" 칸 주변 → 2단계 시계 아이콘과 "남은시간" 글자(바뀌는 숫자는 빼고).',
  },
  {
    kind: 'rune',
    label: '룬',
    mode: 'appear',
    hint: '룬이 맵에 있을 때 등록하세요. 1단계 미니맵 → 2단계 미니맵의 룬 표시.',
  },
];
const messages: Record<WatchAlert, string> = {
  appear: '화면에 나타났어요.',
  soon: '곧 끝나요. (5초 남음)',
  gone: '꺼졌어요.',
};

type Draft = {
  frame: HTMLCanvasElement;
  label: string;
  kind: Kind;
  area: Area | null;
  crop: HTMLCanvasElement | null;
  icon: Area | null;
  iconCanvas: HTMLCanvasElement | null;
  number: Area | null;
};
type Status = { score: number; icon: boolean; number?: boolean; note: string };

const whole = (canvas: HTMLCanvasElement) =>
  pixelsOf(canvas, { x: 0, y: 0, w: canvas.width, h: canvas.height });
const kindOf = (kind: Kind) => kinds.find((k) => k.kind === kind) ?? kinds[0];

export function ScreenWatch({
  capture,
  watchers,
  onWatchers,
  readings,
  onReading,
  onAlert,
}: {
  capture: ScreenCapture;
  watchers: Watcher[];
  onWatchers: (next: Watcher[]) => void;
  readings: Readings;
  onReading: (next: Readings) => void;
  onAlert: (label: string, message: string) => void;
}) {
  const preview = useRef<HTMLVideoElement>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [status, setStatus] = useState<Record<string, Status>>({});
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
    if (!active || !enabled.length) return;
    let busy = false;
    let stopped = false;
    const icons = new Map<string, { pixels: Pixels; art?: Uint8Array }>();
    const presence = new Map<string, Presence>();
    const tick = async () => {
      if (busy || stopped) return;
      busy = true;
      try {
        const frame = await grab();
        if (!frame || stopped) return;
        const began = performance.now();
        const now = Date.now();
        const next: Record<string, Status> = {};
        for (const w of enabled) {
          if (
            frame.width !== w.frame.w ||
            frame.height !== w.frame.h ||
            !sameArea(w.area, w.frame)
          ) {
            next[w.id] = { score: 0, icon: false, note: '화면 크기가 달라요. 다시 등록해 주세요.' };
            continue;
          }
          let icon = icons.get(w.id);
          if (!icon) {
            const pixels = await iconPixels(w.icon);
            icon = { pixels, art: w.number ? artMask(pixels, w.number) : undefined };
            icons.set(w.id, icon);
          }
          const search = pixelsOf(frame, w.area);
          const found = matchTemplate(search, icon.pixels, icon.art ? KEEP_RATIO : 1);
          const matched = found.score >= w.threshold;
          const number =
            icon.art && w.digits
              ? numberVisible(
                  numberPixels(search, found, icon.art, icon.pixels.width, icon.pixels.height),
                  w.digits,
                )
              : undefined;
          const result = observe(
            presence.get(w.id) ?? initialPresence,
            { icon: matched, number },
            w.mode,
            now,
            number !== undefined,
          );
          presence.set(w.id, result.state);
          next[w.id] = {
            score: found.score,
            icon: result.state.icon.value,
            number: w.number ? result.state.number.value : undefined,
            note: '',
          };
          if (result.alert) alertRef.current(w.label, messages[result.alert]);
        }
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
  }, [active, grab, watchers]);

  async function begin(kind: Kind) {
    setProblem('');
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
      label: kindOf(kind).label,
      kind,
      area: null,
      crop: null,
      icon: null,
      iconCanvas: null,
      number: null,
    });
  }

  function save(d: Draft) {
    if (!d.area || !d.crop || !d.icon) return;
    const iconCanvas = d.iconCanvas ?? cropCanvas(d.crop, d.icon);
    const number = d.kind === 'buff' && d.number ? d.number : undefined;
    const watcher = watcherSchema.safeParse({
      id: crypto.randomUUID(),
      label: d.label,
      mode: kindOf(d.kind).mode,
      frame: { w: d.frame.width, h: d.frame.height },
      area: d.area,
      icon: iconCanvas.toDataURL('image/png'),
      number,
      digits: number ? registeredDigits(whole(iconCanvas), number) : undefined,
      threshold: 0.9,
      enabled: true,
    });
    if (!watcher.success) {
      setProblem('이름(20자 이내)과 고른 영역을 확인해 주세요.');
      return;
    }
    onWatchers([...watchers, watcher.data]);
    setDraft(null);
  }

  async function snapshot(side: 'b' | 'a') {
    setProblem('');
    const frame = await grab();
    if (!frame) return;
    const { image, release } = await canvasImage(frame);
    try {
      setReading('화면에서 메소·조각 칸을 찾는 중…');
      const ocr = await engine();
      const result = await ocr.read(image, await ocr.detect(image), setReading);
      const clean = (v: string | null) => {
        const n = v?.replace(/\D/g, '') ?? '';
        return /^\d{1,16}$/.test(n) ? n : undefined;
      };
      const meso = clean(result.meso);
      const fragment = result.fragmentIssue ? undefined : clean(result.fragment);
      onReading(side === 'b' ? { bm: meso, bf: fragment } : { am: meso, af: fragment });
      setReading(
        meso && fragment
          ? '읽었어요. 기록 화면에서 숫자를 한 번 더 확인해 주세요.'
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
  const draftDigits =
    draft?.iconCanvas && draft.number ? registeredDigits(whole(draft.iconCanvas), draft.number) : 0;

  function stateText(w: Watcher, s?: Status) {
    if (!w.enabled || !active) return '꺼짐';
    if (!s) return '…';
    if (s.note) return '확인';
    if (!s.icon) return '안 보임';
    if (s.number === undefined) return '보임';
    return s.number ? '보임 · 시간 표시' : '보임 · 숫자 없음';
  }

  return (
    <>
      <section className="live-card" aria-labelledby="live-alerts">
        <h2 id="live-alerts">버프·룬 알림</h2>
        <p className="live-note">
          게임 화면에서 버프 아이콘을 직접 골라 등록하면, 남은 시간 숫자가 사라질 때(5초 전) 소리로
          알려 줘요. 룬은 미니맵에 나타나면 알려 줘요.
        </p>
        {!active && (
          <p className="live-note live-problem">
            화면 공유를 켜야 등록하고 감지할 수 있어요. 재획 시작을 누르면 함께 켜져요.
          </p>
        )}
        <ul className="live-timers">
          {watchers.map((w) => {
            const s = status[w.id];
            return (
              <li key={w.id}>
                <div className="live-timer-head">
                  <b>{w.label}</b>
                  <small>
                    {w.mode === 'appear'
                      ? '나타나면 알림'
                      : w.number
                        ? '숫자가 사라지면(5초 전) 알림'
                        : '사라지면 알림'}
                  </small>
                  <span className="live-timer-left">{stateText(w, s)}</span>
                </div>
                {s && active && w.enabled && (
                  <small className="live-sub">
                    {s.note ||
                      `비슷한 정도 ${Math.round(s.score * 100)}% (기준 ${Math.round(w.threshold * 100)}%)`}
                  </small>
                )}
                <div className="live-timer-actions">
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
            {kinds.map((k) => (
              <button
                key={k.kind}
                type="button"
                disabled={!active}
                onClick={() => void begin(k.kind)}
              >
                + {k.label} 등록
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
            <p className="live-note">{kindOf(draft.kind).hint}</p>
            {!draft.crop && (
              <>
                <p className="live-note">
                  <b>1단계</b> 멈춘 화면에서 살펴볼 영역을 드래그하세요. 좁을수록 빠르고
                  정확해요(최대 {AREA_MAX}×{AREA_MAX}px
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
                  <b>2단계</b> 확대한 영역에서 아이콘만 꼭 맞게 드래그하세요({ICON_MIN}~{ICON_MAX}
                  px{draft.icon ? `, 지금 ${draft.icon.w}×${draft.icon.h}px` : ''}).
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
                  {draft.kind === 'buff' ? (
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
                  ) : (
                    <button
                      type="button"
                      className="live-primary"
                      disabled={!iconOk(draft.icon)}
                      onClick={() => save(draft)}
                    >
                      등록
                    </button>
                  )}
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
                  <b>3단계</b> 아이콘 아래쪽의 남은 시간 숫자(예: 30)를 드래그하세요. 1분 아래로
                  가면 가운데 노란 초 숫자로 바뀌어도 따라가고, 숫자가 사라지면(5초 전) 알려 줘요.
                  {draft.number
                    ? draftDigits >= 4
                      ? ` (글자 픽셀 ${draftDigits}개 확인)`
                      : ' (숫자가 잘 안 보여요. 숫자를 조금 넉넉히 감싸 보세요.)'
                    : ''}
                </p>
                <div className="live-zoom live-zoom-icon">
                  <RegionPicker
                    source={draft.iconCanvas}
                    value={draft.number}
                    label="남은 시간 숫자 고르기"
                    onChange={(number) => setDraft({ ...draft, number })}
                  />
                </div>
                <div className="live-actions live-left">
                  <button
                    type="button"
                    className="live-primary"
                    disabled={!draft.number || draftDigits < 4}
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

      <section className="live-card" aria-labelledby="live-screen">
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
          <div>
            <dt>사냥 전</dt>
            <dd>
              {shown(readings.bm)} 메소 · {shown(readings.bf)} 개
            </dd>
          </div>
          <div>
            <dt>사냥 후</dt>
            <dd>
              {shown(readings.am)} 메소 · {shown(readings.af)} 개
            </dd>
          </div>
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
