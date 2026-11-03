import { useEffect, useState } from 'react';
import { equipmentResponse, type Equipment } from '@/contracts/simulator/schema';
import { ledgerRequest, errorMessage } from '@/lib/ledger/api';
import { parts } from './potential';
export const manualEquipment: Equipment = {
  name: '직접 선택한 장비',
  slot: '무기',
  icon: '',
  level: 200,
  part: 1,
  stars: 17,
  potentialGrade: 3,
  additionalGrade: 2,
  potential: ['', '', ''],
  additional: ['', '', ''],
};
export function EquipmentPicker({ onSelect }: { onSelect: (e: Equipment) => void }) {
  const [nickname, setNickname] = useState(''),
    [key, setKey] = useState('');
  const [presets, setPresets] = useState<{ id: number; equipment: Equipment[] }[]>([]);
  const [preset, setPreset] = useState(0);
  const [items, setItems] = useState<Equipment[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const [manual, setManual] = useState(manualEquipment),
    [remember, setRemember] = useState(false);
  useEffect(() => {
    const syncKey = () => {
      try {
        setKey(localStorage.getItem('maple-boss-nexon-api-key') || '');
      } catch {}
    };
    const timer = setTimeout(syncKey, 0);
    window.addEventListener('storage', syncKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('storage', syncKey);
    };
  }, []);
  async function search() {
    setBusy(true);
    setMessage('장비를 조회하고 있어요.');
    try {
      const apiKey = key.trim() || localStorage.getItem('maple-boss-nexon-api-key') || '';

      if (!apiKey) throw Error('넥슨 API 키를 입력해 주세요.');
      const data = equipmentResponse.parse(
        await ledgerRequest('simulator-equipment', { apiKey, nickname }),
      );
      setItems(data.equipment);
      setPresets([{ id: 0, equipment: data.equipment }, ...data.presets]);
      setPreset(0);
      if (remember && key.trim()) localStorage.setItem('maple-boss-nexon-api-key', apiKey);
      setMessage(
        data.equipment.length + '개 장비를 가져왔어요. 시뮬레이션할 장비를 선택해 주세요.',
      );
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="sim-panel">
      <h2>시작 장비</h2>
      <div className="sim-fields">
        <label>
          캐릭터 닉네임
          <input
            value={nickname}
            maxLength={12}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="닉네임 입력"
          />
        </label>
        <button className="sim-primary" onClick={search} disabled={busy || !nickname.trim()}>
          {busy ? '조회 중…' : '내 장비 가져오기'}
        </button>
      </div>
      <details>
        <summary>넥슨 API 키 입력 · 변경</summary>
        <p>
          보스 메뉴에서 저장한 API 키를 자동으로 불러옵니다. 새 키도 저장하면 다른 메뉴에서 이어서
          사용할 수 있어요.
        </p>
        <label>
          API 키
          <input
            type="password"
            autoComplete="off"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="저장된 키를 사용하려면 비워 두세요"
          />
        </label>
        <label className="sim-check">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          이 브라우저에 키 저장
        </label>
        <a href="https://openapi.nexon.com/ko/" target="_blank" rel="noreferrer">
          넥슨 Open API에서 키 발급하기 ↗
        </a>
      </details>
      <p role="status">{message}</p>
      {presets.length > 0 && (
        <label>
          장비 프리셋
          <select
            value={preset}
            onChange={(e) => {
              const id = Number(e.target.value);
              setPreset(id);
              setItems(presets.find((p) => p.id === id)?.equipment || []);
            }}
          >
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id === 0 ? '현재 착용 장비' : '프리셋 ' + p.id} ({p.equipment.length}개)
              </option>
            ))}
          </select>
          <small>사냥 장비로 접속했다면 보스 장비가 저장된 프리셋을 선택하세요.</small>
        </label>
      )}
      {items.length > 0 && (
        <div className="sim-equipment-list">
          {items.map((i) => (
            <button key={i.slot} onClick={() => onSelect(i)}>
              {i.icon && <img src={i.icon} alt="" width="36" height="36" />}
              <span>
                <b>{i.name}</b>
                <small>
                  {i.slot} · Lv.{i.level} · ★ {i.stars}
                </small>
              </span>
            </button>
          ))}
        </div>
      )}
      <details open={items.length === 0}>
        <summary>직접 장비 선택</summary>
        <div className="sim-fields">
          <label>
            부위
            <select
              value={manual.part}
              onChange={(e) =>
                setManual({
                  ...manual,
                  part: Number(e.target.value),
                  slot: parts[Number(e.target.value) - 1],
                })
              }
            >
              {parts.map((n, i) => (
                <option key={n} value={i + 1}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label>
            장비 레벨
            <input
              type="number"
              min="1"
              max="250"
              value={manual.level}
              onChange={(e) => setManual({ ...manual, level: Number(e.target.value) })}
            />
          </label>
          <button
            onClick={() => onSelect({ ...manual, name: manual.level + '제 ' + manual.slot })}
            disabled={!Number.isInteger(manual.level) || manual.level < 1 || manual.level > 250}
          >
            이 장비로 시작
          </button>
        </div>
      </details>
    </section>
  );
}
