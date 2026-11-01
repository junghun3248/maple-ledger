'use client';
import { useState } from 'react';
import { z } from 'zod';
import { Dialog } from '@/components/ledger/Dialog';
import { profileSchema } from '@/contracts/boss/schema';
import type { Character } from '@/contracts/boss/state';
import { ledgerRequest, errorMessage } from '@/lib/ledger/api';
export function CharacterDialog({
  onAdd,
  onClose,
}: {
  onAdd: (character: Character) => boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState(''),
    [result, setResult] = useState<Character | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  function add(c: Character) {
    if (onAdd(c)) onClose();
  }
  return (
    <Dialog title="닉네임으로 캐릭터 추가" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            const r = z
              .object({ character: z.object({ name: z.string(), profile: profileSchema }) })
              .parse(await ledgerRequest('character-search', { nickname: name }));
            setResult({ ...r.character, id: crypto.randomUUID(), runs: [] });
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          닉네임
          <input
            required
            maxLength={40}
            value={name}
            disabled={busy}
            onChange={(e) => {
              setName(e.target.value);
              setResult(null);
            }}
          />
        </label>
        <button className="primary" disabled={busy}>
          공식 랭킹 검색
        </button>
      </form>
      <p role="status">{error}</p>
      {result && (
        <div>
          <h3>{result.name}</h3>
          <p>
            Lv.{result.profile?.level} · {result.profile?.world} · {result.profile?.job}
          </p>
          <button className="primary" onClick={() => add(result)}>
            이 캐릭터 추가
          </button>
        </div>
      )}
      <button
        className="quiet"
        disabled={busy || !name.trim()}
        onClick={() => add({ id: crypto.randomUUID(), name: name.trim(), runs: [] })}
      >
        검색 없이 입력한 이름으로 추가
      </button>
    </Dialog>
  );
}
