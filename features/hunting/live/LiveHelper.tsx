'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { PageHeading } from '@/components/ledger/PageHeading';
import { dateKey } from '@/lib/ledger/format';
import {
  clock,
  elapsedMs,
  initialLiveState,
  LIVE_KEY,
  pauseSession,
  PREFILL_KEY,
  readLiveState,
  resumeSession,
  sessionMinutes,
  startSession,
  type HuntPrefill,
  type LiveState,
} from './session';
import {
  notificationsSupported,
  showNotification,
  speak,
  startTicker,
  unlockSound,
  warmVoices,
} from './notify';
import { useScreenCapture } from './capture/useScreenCapture';
import { ScreenWatch } from './ScreenWatch';
import './live.css';

export function LiveHelper() {
  const router = useRouter();
  const capture = useScreenCapture();
  const [state, setState] = useState<LiveState>(initialLiveState);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [alert, setAlert] = useState('');
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const stateRef = useRef(state);

  // 저장된 세션은 브라우저에서만 읽을 수 있어 첫 렌더 뒤에 불러온다.
  useEffect(() => {
    const timer = setTimeout(() => {
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(LIVE_KEY);
      } catch {}
      setState(readLiveState(saved));
      setPermission(notificationsSupported() ? Notification.permission : 'unsupported');
      warmVoices();
      setLoaded(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    stateRef.current = state;
    if (!loaded) return;
    try {
      localStorage.setItem(LIVE_KEY, JSON.stringify(state));
    } catch {}
  }, [loaded, state]);

  const session = state.session;
  const running = session && session.pausedAt === null;

  useEffect(() => {
    if (!session) return;
    return startTicker(() => setNow(Date.now()));
  }, [session]);

  useEffect(() => {
    if (!loaded || !session) return;
    const original = document.title;
    const shown = `${running ? '▶' : '⏸'} ${clock(elapsedMs(session, now))} · 재획`;
    document.title = shown;
    return () => {
      // 다른 화면으로 이동해 제목이 이미 바뀌었으면 건드리지 않는다.
      if (document.title === shown) document.title = original;
    };
  }, [loaded, session, running, now]);

  const update = (next: Partial<LiveState>) => setState((s) => ({ ...s, ...next }));

  function ring(text: string) {
    setAlert(text);
    if (stateRef.current.sound) speak(text, stateRef.current.volume);
    showNotification('재획 타이머', text);
  }

  function begin() {
    unlockSound();
    const started = Date.now();
    setNow(started);
    update({ session: startSession(started), readings: {} });
    // 화면 공유 창은 사용자의 클릭 안에서만 열 수 있어 같은 클릭에서 바로 연다.
    if (!capture.active) void capture.start();
  }

  function finish() {
    if (!session) return;
    const prefill: HuntPrefill = {
      date: dateKey(new Date(session.startedAt)),
      minutes: sessionMinutes(session, Date.now()),
      ...state.readings,
    };
    if (!confirm(`재획을 끝내고 사냥 기록에 ${prefill.minutes}분으로 옮길까요?`)) return;
    localStorage.setItem(PREFILL_KEY, JSON.stringify(prefill));
    update({ session: null, readings: {} });
    capture.stop();
    router.push('/hunting#hunt-entry');
  }

  return (
    <main className="live-page" onPointerDown={unlockSound}>
      <PageHeading
        title="재획 타이머"
        description="사냥 시간을 재고, 게임 화면을 공유하면 버프·부스터가 끝날 때와 룬이 나타날 때 소리로 알려 줘요."
      >
        <Link href="/hunting">사냥 기록으로</Link>
      </PageHeading>

      {alert && (
        <p className="live-alert" role="alert">
          {alert}
          <button type="button" onClick={() => setAlert('')}>
            확인
          </button>
        </p>
      )}

      <section className="live-card live-session" aria-label="재획 세션">
        <span className="live-label">
          {session ? (running ? '사냥 중' : '일시정지') : '재획 세션'}
          {capture.active ? ' · 화면 공유 중' : ''}
        </span>
        <strong className="live-clock" aria-live="off">
          {clock(session ? elapsedMs(session, now) : 0)}
        </strong>
        {session && (
          <small className="live-sub">
            {new Date(session.startedAt).toLocaleTimeString('ko-KR', {
              hour: '2-digit',
              minute: '2-digit',
            })}{' '}
            시작
          </small>
        )}
        <div className="live-actions">
          {!session && (
            <button type="button" className="live-primary" onClick={begin}>
              재획 시작
            </button>
          )}
          {session && !capture.active && (
            <button type="button" onClick={() => void capture.start()}>
              게임 화면 공유
            </button>
          )}
          {session && running && (
            <button
              type="button"
              onClick={() => update({ session: pauseSession(session, Date.now()) })}
            >
              일시정지
            </button>
          )}
          {session && !running && (
            <button
              type="button"
              onClick={() => update({ session: resumeSession(session, Date.now()) })}
            >
              다시 시작
            </button>
          )}
          {session && (
            <>
              <button type="button" className="live-primary" onClick={finish}>
                끝내고 기록하기
              </button>
              <button
                type="button"
                className="live-quiet"
                onClick={() => {
                  if (!confirm('기록하지 않고 세션을 지울까요?')) return;
                  update({ session: null, readings: {} });
                  capture.stop();
                }}
              >
                취소
              </button>
            </>
          )}
        </div>
        <p className="live-note">
          재획 시작을 누르면 화면 공유 창이 열려요. 메이플스토리 창을 골라 주세요. 끝내면 사냥 기록
          입력칸에 날짜·시간과 읽어 둔 메소·조각이 채워져요.
        </p>
      </section>

      <ScreenWatch
        capture={capture}
        watchers={state.watchers}
        onWatchers={(watchers) => update({ watchers })}
        readings={state.readings}
        onReading={(next) => setState((s) => ({ ...s, readings: { ...s.readings, ...next } }))}
        onAlert={ring}
      />

      <section className="live-card" aria-labelledby="live-sound">
        <h2 id="live-sound">음성 알림</h2>
        <div className="live-sound">
          <label className="live-check">
            <input
              type="checkbox"
              checked={state.sound}
              onChange={(e) => update({ sound: e.target.checked })}
            />
            음성
          </label>
          <label className="live-volume">
            볼륨
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={state.volume}
              disabled={!state.sound}
              onChange={(e) => update({ volume: Number(e.target.value) })}
            />
          </label>
          <button
            type="button"
            onClick={() => {
              unlockSound();
              speak('버프 꺼져요', state.volume);
            }}
          >
            음성 듣기
          </button>
          {permission === 'default' && (
            <button
              type="button"
              onClick={async () => setPermission(await Notification.requestPermission())}
            >
              브라우저 알림 켜기
            </button>
          )}
        </div>
        <p className="live-note">
          {permission === 'granted'
            ? '게임 화면을 보고 있어도 브라우저 알림이 떠요.'
            : permission === 'denied'
              ? '브라우저 알림이 차단돼 있어요. 주소창의 사이트 설정에서 바꿀 수 있어요.'
              : '알림을 켜면 게임 화면을 보고 있어도 알림이 떠요.'}{' '}
          이 탭은 닫지 말고 열어 두세요.
        </p>
      </section>
    </main>
  );
}
