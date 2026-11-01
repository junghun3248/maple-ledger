'use client';
import { useState } from 'react';
import { Dialog } from './Dialog';
import { ledgerRequest, errorMessage } from '@/lib/ledger/api';
export function BookDialog({
  onClose,
  onOpened,
}: {
  onClose: () => void;
  onOpened: () => Promise<void>;
}) {
  const [name, setName] = useState(() => {
      try {
        return typeof window === 'undefined'
          ? ''
          : localStorage.getItem('maple-ledger-v1-book-name') || '';
      } catch {
        return '';
      }
    }),
    [password, setPassword] = useState(''),
    [repeat, setRepeat] = useState(''),
    [creating, setCreating] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <Dialog title={creating ? '새 기록장 만들기' : '기록장 열기'} onClose={onClose}>
      <p className="muted">다른 기기에서도 같은 이름과 비밀번호로 이어서 기록하세요.</p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (creating && password !== repeat) {
            setError('비밀번호가 서로 달라요.');
            return;
          }
          setBusy(true);
          setError('');
          try {
            await ledgerRequest(creating ? 'create' : 'open', { name, password });
            try {
              localStorage.setItem('maple-ledger-v1-book-name', name.trim());
            } catch {}
            setPassword('');
            setRepeat('');
            await onOpened();
            onClose();
          } catch (error) {
            setError(errorMessage(error));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          기록장 이름
          <input
            required
            autoComplete="username"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          비밀번호
          <input
            required
            type="password"
            minLength={creating ? 9 : 1}
            maxLength={128}
            autoComplete={creating ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {creating && (
          <>
            <label>
              비밀번호 확인
              <input
                required
                type="password"
                value={repeat}
                onChange={(e) => setRepeat(e.target.value)}
              />
            </label>
            <p className="muted">
              새 비밀번호는 9자 이상입니다. 비밀번호를 잊으면 기록장을 복구할 수 없어요.
            </p>
          </>
        )}
        <p role="alert">{error}</p>
        <button className="primary" disabled={busy}>
          {busy ? '확인 중…' : creating ? '기록장 만들기' : '기록장 열기'}
        </button>
        <button
          type="button"
          className="quiet"
          disabled={busy}
          onClick={() => {
            setCreating(!creating);
            setError('');
          }}
        >
          {creating ? '기존 기록장 열기' : '새 기록장 만들기'}
        </button>
      </form>
    </Dialog>
  );
}
