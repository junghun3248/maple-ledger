'use client';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { PageHeading } from '@/components/ledger/PageHeading';
import {
  FEEDBACK_MAX,
  REPLY_MAX,
  feedbackListSchema,
  hasLink,
  type FeedbackPost,
} from '@/contracts/feedback/schema';
import './feedback.css';

const ADMIN_STORAGE = 'maple-feedback-admin';

async function feedbackRequest(body: Record<string, unknown>) {
  const response = await fetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      result && typeof result === 'object' && 'error' in result && typeof result.error === 'string'
        ? result.error
        : '요청을 처리하지 못했어요.';
    throw new Error(message);
  }
  return result;
}
const message = (e: unknown) => (e instanceof Error ? e.message : '요청을 처리하지 못했어요.');
const when = (time: number) =>
  new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(time);

/** 건의·제보 게시판. 누구나 글을 남기고, 운영자는 비밀번호로 답글·삭제를 한다. */
export function FeedbackPage() {
  const [posts, setPosts] = useState<FeedbackPost[]>([]),
    [loaded, setLoaded] = useState(false),
    [body, setBody] = useState(''),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(''),
    [admin, setAdmin] = useState(''),
    [password, setPassword] = useState(''),
    [drafts, setDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/feedback', { cache: 'no-store' });
      setPosts(feedbackListSchema.parse(await response.json()).posts);
    } catch {
      setStatus('글을 불러오지 못했어요. 잠시 후 새로고침해 주세요.');
    } finally {
      setLoaded(true);
    }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
      try {
        setAdmin(sessionStorage.getItem(ADMIN_STORAGE) || '');
      } catch {}
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const text = body.trim();
  const problem =
    text.length > FEEDBACK_MAX
      ? `${FEEDBACK_MAX}자까지 적을 수 있어요.`
      : hasLink(text)
        ? '링크는 남길 수 없어요.'
        : '';

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || text.length < 2 || problem) return;
    setBusy(true);
    setStatus('');
    try {
      await feedbackRequest({ action: 'create', body: text });
      setBody('');
      setStatus('남겨 주셔서 고마워요. 확인하고 답글로 알려 드릴게요.');
      await load();
    } catch (error) {
      setStatus(message(error));
    } finally {
      setBusy(false);
    }
  }

  async function signIn(e: FormEvent) {
    e.preventDefault();
    if (!password) return;
    try {
      await feedbackRequest({ action: 'admin-check', password });
      setAdmin(password);
      setPassword('');
      try {
        sessionStorage.setItem(ADMIN_STORAGE, password);
      } catch {}
      setStatus('운영자 모드예요. 글마다 답글과 삭제가 보여요.');
    } catch (error) {
      setStatus(message(error));
    }
  }
  function signOut() {
    setAdmin('');
    try {
      sessionStorage.removeItem(ADMIN_STORAGE);
    } catch {}
  }
  async function adminAction(body: Record<string, unknown>) {
    try {
      await feedbackRequest({ ...body, password: admin });
      await load();
    } catch (error) {
      setStatus(message(error));
    }
  }

  return (
    <div className="feedback-page">
      <main>
        <PageHeading
          title="건의·제보"
          description="불편한 점, 버그, 있었으면 하는 기능을 남겨 주세요. 확인하면 답글을 달아 드려요."
        />
        <form className="feedback-form" onSubmit={submit}>
          <textarea
            aria-label="건의 내용"
            value={body}
            maxLength={FEEDBACK_MAX + 50}
            rows={4}
            placeholder="예: 헥사 계산기에서 3rd 스킬 코어가 일반 스킬 코어로 잡혀요."
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="feedback-form-foot">
            <small className={problem ? 'feedback-problem' : undefined}>
              {problem ||
                `${text.length} / ${FEEDBACK_MAX}자 · 닉네임·연락처 같은 개인정보는 적지 말아 주세요.`}
            </small>
            <button className="primary" disabled={busy || text.length < 2 || !!problem}>
              등록
            </button>
          </div>
        </form>
        {status && (
          <p className="feedback-status" role="status">
            {status}
          </p>
        )}

        <section className="feedback-list" aria-label="건의 목록">
          <h2>건의 {posts.length}개</h2>
          {loaded && posts.length === 0 && (
            <p className="feedback-empty">아직 남겨진 글이 없어요.</p>
          )}
          <ul>
            {posts.map((post) => (
              <li key={post.id}>
                <p className="feedback-body">{post.body}</p>
                <time dateTime={new Date(post.createdAt).toISOString()}>
                  {when(post.createdAt)}
                </time>
                {post.reply && (
                  <p className="feedback-reply">
                    <b>운영자</b> {post.reply}
                  </p>
                )}
                {admin && (
                  <div className="feedback-admin-row">
                    <input
                      aria-label="답글"
                      maxLength={REPLY_MAX}
                      value={drafts[post.id] ?? post.reply ?? ''}
                      onChange={(e) => setDrafts({ ...drafts, [post.id]: e.target.value })}
                      placeholder="답글"
                    />
                    <button
                      type="button"
                      className="secondary"
                      onClick={() =>
                        void adminAction({
                          action: 'reply',
                          id: post.id,
                          reply: drafts[post.id] ?? post.reply ?? '',
                        })
                      }
                    >
                      답글 저장
                    </button>
                    <button
                      type="button"
                      className="quiet"
                      onClick={() => {
                        if (confirm('이 글을 삭제할까요? 되돌릴 수 없어요.'))
                          void adminAction({ action: 'delete', id: post.id });
                      }}
                    >
                      삭제
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>

        <details className="feedback-admin">
          <summary>운영자</summary>
          {admin ? (
            <button type="button" className="quiet" onClick={signOut}>
              운영자 모드 끝내기
            </button>
          ) : (
            <form onSubmit={signIn}>
              <input
                type="password"
                aria-label="운영자 비밀번호"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button className="secondary">확인</button>
            </form>
          )}
        </details>
      </main>
    </div>
  );
}
