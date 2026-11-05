'use client';
import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import type { Character, Run } from '@/contracts/boss/state';
import { Dialog } from '@/components/ledger/Dialog';
import { errorMessage } from '@/lib/ledger/api';
import { applyRatios, type RatioResult } from './ratio-ocr/result';
import './ratio-ocr/ratio.css';
export function RatioScreenshotDialog({
  character,
  runs,
  onApply,
  onClose,
}: {
  character: Character;
  runs: Run[];
  onApply: (runs: Run[]) => boolean;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<RatioResult[]>([]),
    [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState(''),
    [minutes, setMinutes] = useState('20');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const matches = (row: RatioResult) =>
    runs.some((r) => r.name === row.name && r.difficulty === row.difficulty);
  async function read(file: File) {
    controller.current?.abort();
    const control = new AbortController();
    controller.current = control;
    setBusy(true);
    setRows([]);
    setSelected([]);
    setStatus('사진 준비 중…');
    try {
      const { readRatios } = await import('./ratio-ocr/read');
      const result = await readRatios(
        file,
        (s) => {
          if (!control.signal.aborted) setStatus(s);
        },
        control.signal,
      );
      if (control.signal.aborted) return;
      setRows(result);
      setSelected(result.filter((r) => r.confident && matches(r)).map((r) => r.id));
      setStatus(`${result.length}개 카드 인식 · 초상화, 난이도, 숫자를 확인한 뒤 적용하세요.`);
    } catch (e) {
      if (!control.signal.aborted) setStatus(errorMessage(e));
    } finally {
      if (!control.signal.aborted) setBusy(false);
    }
  }
  const change = (id: string, patch: Partial<RatioResult>) =>
    setRows((old) => old.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  return (
    <Dialog
      title={`${character.name} · 배율 스크린샷`}
      onClose={() => {
        controller.current?.abort();
        onClose();
      }}
      className="ratio-dialog"
    >
      <p>
        보스 카드 전체가 나온 사진을 올려 주세요. 카드 순서가 달라도 초상화·난이도로 연결합니다.
      </p>
      <p className="muted">
        사진은 브라우저에서만 처리합니다. 처음 사용할 때 OCR 언어 파일을 다운로드하며, 밝은/어두운
        배경이나 화질에 따라 확인이 필요할 수 있어요.
      </p>
      <label>
        배율 스크린샷
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void read(f);
            e.target.value = '';
          }}
        />
      </label>
      <p role="status">{status}</p>
      {busy && (
        <button
          className="quiet"
          onClick={() => {
            controller.current?.abort();
            setBusy(false);
            setStatus('인식을 취소했어요.');
          }}
        >
          인식 취소
        </button>
      )}
      {!!rows.length && (
        <>
          <label>
            배율 기준 시간 (분)
            <input
              type="number"
              min="0.1"
              max="120"
              step="0.1"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
          </label>
          <p className="muted">
            [파티] 배율은 개인 배율로 사용할 수 없어 제외합니다. 데스티니·챔피언이나 정산표에 없는
            보스도 자동 연결하지 않습니다. 모르는 초상화는 누락될 수 있어요.
          </p>
          <div className="ratio-results">
            {rows.map((row) => {
              const target = runs.find(
                (r) => r.name === row.name && r.difficulty === row.difficulty,
              );
              const valid =
                !row.party &&
                !!target &&
                row.ratio !== null &&
                row.ratio > 0 &&
                row.ratio <= 1000000;
              return (
                <article key={row.id}>
                  <Image
                    unoptimized
                    width={110}
                    height={210}
                    src={row.preview}
                    alt={`인식 카드 ${Number(row.id) + 1}`}
                  />
                  <div>
                    <strong>
                      {row.name} · {row.difficulty || '난이도 확인 필요'}
                    </strong>
                    <p>
                      {row.party
                        ? '파티 배율 · 적용 제외'
                        : !target
                          ? '정산표에 해당 난이도 없음'
                          : row.confident
                            ? '인식 완료 · 확인 후 적용'
                            : '인식 확인 필요'}
                    </p>
                    <label>
                      연결할 보스
                      <select
                        disabled={row.party}
                        value={target?.id || ''}
                        onChange={(e) => {
                          const r = runs.find((r) => r.id === e.target.value);
                          if (r)
                            change(row.id, {
                              name: r.name,
                              difficulty: r.difficulty,
                              confident: false,
                            });
                          else {
                            change(row.id, { difficulty: '' });
                            setSelected((s) => s.filter((id) => id !== row.id));
                          }
                        }}
                      >
                        <option value="">연결 안 함</option>
                        {runs.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name} · {r.difficulty}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      개인 배율 (%)
                      <input
                        type="number"
                        disabled={row.party}
                        min="0.01"
                        max="1000000"
                        step="0.01"
                        value={row.ratio ?? ''}
                        onChange={(e) =>
                          change(row.id, {
                            ratio: e.target.value ? Number(e.target.value) : null,
                            confident: false,
                          })
                        }
                      />
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        disabled={!valid}
                        checked={valid && selected.includes(row.id)}
                        onChange={(e) =>
                          setSelected((s) =>
                            e.target.checked ? [...s, row.id] : s.filter((id) => id !== row.id),
                          )
                        }
                      />
                      확인했어요 · 적용
                    </label>
                    <details>
                      <summary>읽은 문자 보기</summary>
                      <small>{row.text}</small>
                    </details>
                  </div>
                </article>
              );
            })}
          </div>
          <button
            className="primary"
            disabled={busy || !selected.length}
            onClick={() => {
              try {
                const updated = applyRatios(runs, rows, selected, Number(minutes));
                const byId = new Map(updated.map((r) => [r.id, r]));
                if (onApply(character.runs.map((r) => byId.get(r.id) || r))) onClose();
              } catch (e) {
                setStatus(errorMessage(e));
              }
            }}
          >
            선택한 배율 적용
          </button>
          <p className="muted">
            현재 표시 중인 주/월의 보스에만 적용합니다. 다른 기기에서도 쓰려면 적용 후 기록장에
            저장해 주세요.
          </p>
        </>
      )}
    </Dialog>
  );
}
