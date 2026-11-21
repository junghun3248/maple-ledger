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
import { captureSupported, useScreenCapture } from './capture/useScreenCapture';
import { matchTemplate, type Pixels } from './detectors/template';
import { initialPresence, observe, type Presence, type WatchMode } from './detectors/state';

const sensitivity = [
  { label: '정확하게', value: 0.94 },
  { label: '보통', value: 0.9 },
  { label: '넉넉하게', value: 0.85 },
];
const presets: { label: string; mode: WatchMode; hint: string }[] = [
  {
    label: '룬',
    mode: 'appear',
    hint: '룬이 맵에 있을 때 미니맵을 영역으로, 미니맵의 룬 표시를 아이콘으로 골라 주세요.',
  },
  {
    label: '버프',
    mode: 'disappear',
    hint: '버프가 켜져 있을 때 버프 아이콘 줄을 영역으로, 그 버프 아이콘을 골라 주세요.',
  },
];

type Draft = {
  frame: HTMLCanvasElement;
  label: string;
  mode: WatchMode;
  area: Area | null;
  crop: HTMLCanvasElement | null;
  icon: Area | null;
};
type Status = { score: number; present: boolean; note: string };

export function ScreenWatch({
  watchers,
  onWatchers,
  readings,
  onReading,
  onAlert,
}: {
  watchers: Watcher[];
  onWatchers: (next: Watcher[]) => void;
  readings: Readings;
  onReading: (next: Readings) => void;
  onAlert: (label: string, message: string) => void;
}) {
  const capture = useScreenCapture();
  const preview = useRef<HTMLVideoElement>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [cost, setCost] = useState<number | null>(null);
  const [reading, setReading] = useState('');
  const [problem, setProblem] = useState('');
  const alertRef = useRef(onAlert);
  const { active, grab, stream } = capture;

  useEffect(() => {
    alertRef.current = onAlert;
  }, [onAlert]);

  useEffect(() => {
    if (preview.current) preview.current.srcObject = stream;
  }, [stream]);

  // 켜 둔 감지만 1초에 한 번, 등록한 영역만 잘라 비교한다.
  useEffect(() => {
    const enabled = watchers.filter((w) => w.enabled);
    if (!active || !enabled.length) return;
    let busy = false;
    let stopped = false;
    const icons = new Map<string, Pixels>();
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
            next[w.id] = {
              score: 0,
              present: false,
              note: '화면 크기가 달라요. 다시 등록해 주세요.',
            };
            continue;
          }
          let icon = icons.get(w.id);
          if (!icon) {
            icon = await iconPixels(w.icon);
            icons.set(w.id, icon);
          }
          const { score } = matchTemplate(pixelsOf(frame, w.area), icon);
          const seen = observe(
            presence.get(w.id) ?? initialPresence,
            score >= w.threshold,
            w.mode,
            now,
          );
          presence.set(w.id, seen.state);
          next[w.id] = { score, present: seen.state.present, note: '' };
          if (seen.alert)
            alertRef.current(
              w.label,
              w.mode === 'appear' ? '화면에 나타났어요.' : '화면에서 사라졌어요.',
            );
        }
        setCost(Math.round(performance.now() - began));
        setStatus(next);
      } catch (e) {
        setProblem(errorMessage(e));
      } finally {
        busy = false;
      }
    };
    const stop = startTicker(() => void tick());
    return () => {
      stopped = true;
      stop();
    };
  }, [active, grab, watchers]);

  async function begin(label: string, mode: WatchMode) {
    setProblem('');
    if (watchers.length >= WATCHER_MAX) {
      setProblem(`감지는 ${WATCHER_MAX}개까지 등록할 수 있어요.`);
      return;
    }
    const frame = await grab();
    if (!frame) {
      setProblem('화면을 아직 받지 못했어요. 잠시 뒤 다시 눌러 주세요.');
      return;
    }
    const still = cropCanvas(frame, { x: 0, y: 0, w: frame.width, h: frame.height });
    setDraft({ frame: still, label, mode, area: null, crop: null, icon: null });
  }

  function save(d: Draft) {
    if (!d.area || !d.crop || !d.icon) return;
    const icon = cropCanvas(d.crop, d.icon).toDataURL('image/png');
    const watcher = watcherSchema.safeParse({
      id: crypto.randomUUID(),
      label: d.label,
      mode: d.mode,
      frame: { w: d.frame.width, h: d.frame.height },
      area: d.area,
      icon,
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

  return (
    <section className="live-card" aria-labelledby="live-screen">
      <h2 id="live-screen">화면 공유 감지</h2>
      <p className="live-note">
        게임 창을 공유하면 1초에 한 번 등록한 영역만 이 브라우저 안에서 비교해요. 화면은 저장하거나
        서버로 보내지 않아요. 입력이나 게임 조작은 하지 않아요.
      </p>
      {!captureSupported() ? (
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
            <button type="button" className="live-primary" onClick={() => void capture.start()}>
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
        게임은 창 모드나 테두리 없는 창 모드로 두세요. 전체 화면이면 까맣게 보일 수 있어요.
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

      <h3>감지</h3>
      {watchers.length === 0 && (
        <p className="live-note">
          공유를 켠 뒤 아래 버튼으로 내 화면에서 직접 영역과 아이콘을 골라 등록해요.
        </p>
      )}
      <ul className="live-timers">
        {watchers.map((w) => {
          const s = status[w.id];
          return (
            <li key={w.id}>
              <div className="live-timer-head">
                <b>{w.label}</b>
                <small>{w.mode === 'appear' ? '나타나면 알림' : '사라지면 알림'}</small>
                <span className="live-timer-left">
                  {!w.enabled || !active
                    ? '꺼짐'
                    : !s
                      ? '…'
                      : s.note
                        ? '확인'
                        : s.present
                          ? '보임'
                          : '안 보임'}
                </span>
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
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              disabled={!active}
              onClick={() => void begin(p.label, p.mode)}
            >
              + {p.label} 감지 등록
            </button>
          ))}
        </div>
      )}

      {draft && (
        <div className="live-register">
          <div className="live-add live-register-head">
            <label>
              이름
              <input
                maxLength={20}
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              />
            </label>
            <label>
              알림
              <select
                value={draft.mode}
                onChange={(e) => setDraft({ ...draft, mode: e.target.value as WatchMode })}
              >
                <option value="appear">나타나면</option>
                <option value="disappear">사라지면</option>
              </select>
            </label>
          </div>
          <p className="live-note">{presets.find((p) => p.mode === draft.mode)?.hint}</p>
          {!draft.crop ? (
            <>
              <p className="live-note">
                <b>1단계</b> 멈춘 화면에서 살펴볼 영역을 드래그하세요. 좁을수록 빠르고 정확해요(최대{' '}
                {AREA_MAX}×{AREA_MAX}px
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
                    draft.area && setDraft({ ...draft, crop: cropCanvas(draft.frame, draft.area) })
                  }
                >
                  다음
                </button>
                <button type="button" className="live-quiet" onClick={() => setDraft(null)}>
                  취소
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="live-note">
                <b>2단계</b> 확대한 영역에서 알아볼 아이콘만 꼭 맞게 드래그하세요({ICON_MIN}~
                {ICON_MAX}px{draft.icon ? `, 지금 ${draft.icon.w}×${draft.icon.h}px` : ''}).
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
                  onClick={() => save(draft)}
                >
                  등록
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
        </div>
      )}
      {problem && (
        <p className="live-note live-problem" role="status">
          {problem}
        </p>
      )}
    </section>
  );
}
