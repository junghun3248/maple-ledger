'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { PageHeading } from '@/components/ledger/PageHeading';
import { dateKey } from '@/lib/ledger/format';
import {
  clock,
  dueAlerts,
  elapsedMs,
  initialLiveState,
  LIVE_KEY,
  pauseSession,
  PREFILL_KEY,
  readLiveState,
  remainingMs,
  resumeSession,
  sessionMinutes,
  startSession,
  startTimer,
  stopTimer,
  TIMER_MAX_MINUTES,
  timerSchema,
  type HuntPrefill,
  type LiveState,
  type Timer,
} from './session';
import { beep, notificationsSupported, showNotification, startTicker, unlockSound } from './notify';
import { ScreenWatch } from './ScreenWatch';
import './live.css';

const presets = [{ label: '재획비', minutes: 30, repeat: true }];

export function LiveHelper() {
  const router = useRouter();
  const [state, setState] = useState<LiveState>(initialLiveState);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [alert, setAlert] = useState('');
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [draft, setDraft] = useState({ label: '', minutes: '30', repeat: true });
  const [problem, setProblem] = useState('');
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

  useEffect(() => {
    if (!loaded) return;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      const current = stateRef.current;
      const { timers, due } = dueAlerts(current.timers, t);
      if (!due.length) return;
      setState({ ...current, timers });
      const fresh = due.filter((d) => d.fresh);
      setAlert(due.map((d) => d.label).join(', ') + ' 시간이 끝났어요.');
      if (!fresh.length) return;
      if (current.sound) beep(current.volume);
      fresh.forEach((d) => showNotification(d.label, '타이머가 끝났어요.'));
    };
    tick();
    return startTicker(tick);
  }, [loaded]);

  const session = state.session;
  const running = session && session.pausedAt === null;
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
  const setTimer = (id: string, change: (t: Timer) => Timer | null) =>
    setState((s) => ({
      ...s,
      timers: s.timers.flatMap((t) => {
        if (t.id !== id) return [t];
        const next = change(t);
        return next ? [next] : [];
      }),
    }));

  function addTimer(label: string, minutes: number, repeat: boolean) {
    const timer = timerSchema.safeParse({
      id: crypto.randomUUID(),
      label,
      seconds: Math.round(minutes * 60),
      repeat,
      startedAt: null,
      alerted: 0,
    });
    if (!timer.success) {
      setProblem(`이름(20자 이내)과 시간(10초~${TIMER_MAX_MINUTES}분)을 확인해 주세요.`);
      return false;
    }
    if (state.timers.length >= 12) {
      setProblem('타이머는 12개까지 만들 수 있어요.');
      return false;
    }
    setProblem('');
    update({ timers: [...state.timers, timer.data] });
    return true;
  }

  function ring(label: string, message: string) {
    setAlert(`${label}: ${message}`);
    if (stateRef.current.sound) beep(stateRef.current.volume);
    showNotification(label, message);
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
    router.push('/hunting#hunt-entry');
  }

  return (
    <main className="live-page" onPointerDown={unlockSound}>
      <PageHeading
        title="재획 타이머"
        description="사냥 시간을 재고 재획비 같은 버프 시간을 알려 줘요. 이 화면은 브라우저 안에서만 동작해요."
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
            <button
              type="button"
              className="live-primary"
              onClick={() => update({ session: startSession(Date.now()), readings: {} })}
            >
              재획 시작
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
                  if (confirm('기록하지 않고 세션을 지울까요?')) update({ session: null });
                }}
              >
                취소
              </button>
            </>
          )}
        </div>
        <p className="live-note">
          끝내면 사냥 기록 입력칸에 날짜와 사냥 시간이 채워져요. 메소와 조각은 그 화면에서 사진으로
          읽어 확인한 뒤 저장해요.
        </p>
      </section>

      <section className="live-card" aria-labelledby="live-timers">
        <h2 id="live-timers">버프 타이머</h2>
        {state.timers.length === 0 && (
          <p className="live-note">아래에서 타이머를 추가하세요. 예: 재획비 30분 반복</p>
        )}
        <ul className="live-timers">
          {state.timers.map((t) => {
            const left = remainingMs(t, now);
            const done = left === 0;
            const ratio = left === null ? 0 : 1 - left / (t.seconds * 1000);
            return (
              <li key={t.id} className={done ? 'live-done' : undefined}>
                <div className="live-timer-head">
                  <b>{t.label}</b>
                  <small>
                    {clock(t.seconds * 1000)}
                    {t.repeat ? ' · 반복' : ''}
                  </small>
                  <span className="live-timer-left">
                    {left === null ? '대기' : done ? '끝' : clock(left)}
                  </span>
                </div>
                <div className="live-bar" aria-hidden="true">
                  <i style={{ width: `${Math.min(100, ratio * 100)}%` }} />
                </div>
                <div className="live-timer-actions">
                  <button
                    type="button"
                    onClick={() => setTimer(t.id, (x) => startTimer(x, Date.now()))}
                  >
                    {left === null ? '시작' : '다시 시작'}
                  </button>
                  {left !== null && (
                    <button type="button" onClick={() => setTimer(t.id, stopTimer)}>
                      멈춤
                    </button>
                  )}
                  <button
                    type="button"
                    className="live-quiet"
                    onClick={() => setTimer(t.id, () => null)}
                  >
                    삭제
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        <form
          className="live-add"
          onSubmit={(e) => {
            e.preventDefault();
            if (addTimer(draft.label, Number(draft.minutes), draft.repeat))
              setDraft({ ...draft, label: '' });
          }}
        >
          <label>
            이름
            <input
              maxLength={20}
              required
              value={draft.label}
              placeholder="예: 경험치 쿠폰"
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            />
          </label>
          <label>
            시간(분)
            <input
              type="number"
              min={0.5}
              max={TIMER_MAX_MINUTES}
              step={0.5}
              required
              value={draft.minutes}
              onChange={(e) => setDraft({ ...draft, minutes: e.target.value })}
            />
          </label>
          <label className="live-check">
            <input
              type="checkbox"
              checked={draft.repeat}
              onChange={(e) => setDraft({ ...draft, repeat: e.target.checked })}
            />
            반복
          </label>
          <button type="submit">추가</button>
        </form>
        <div className="live-presets">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              className="live-quiet"
              onClick={() => addTimer(p.label, p.minutes, p.repeat)}
            >
              + {p.label} {p.minutes}분
            </button>
          ))}
        </div>
        {problem && (
          <p className="live-note live-problem" role="status">
            {problem}
          </p>
        )}
      </section>

      <ScreenWatch
        watchers={state.watchers}
        onWatchers={(watchers) => update({ watchers })}
        readings={state.readings}
        onReading={(next) => setState((s) => ({ ...s, readings: { ...s.readings, ...next } }))}
        onAlert={ring}
      />

      <section className="live-card" aria-labelledby="live-sound">
        <h2 id="live-sound">알림</h2>
        <div className="live-sound">
          <label className="live-check">
            <input
              type="checkbox"
              checked={state.sound}
              onChange={(e) => update({ sound: e.target.checked })}
            />
            소리
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
              beep(state.volume);
            }}
          >
            소리 듣기
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
            ? '다른 창을 보고 있어도 브라우저 알림이 떠요.'
            : permission === 'denied'
              ? '브라우저 알림이 차단돼 있어요. 주소창의 사이트 설정에서 바꿀 수 있어요.'
              : permission === 'unsupported'
                ? '이 브라우저는 알림을 지원하지 않아요. 소리와 화면 표시로 알려 드려요.'
                : '알림을 켜면 게임 화면을 보고 있어도 타이머가 끝난 걸 알 수 있어요.'}{' '}
          이 탭은 닫지 말고 열어 두세요.
        </p>
      </section>
    </main>
  );
}
