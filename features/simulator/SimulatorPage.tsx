'use client';
import { useState } from 'react';
import type { Equipment } from '@/contracts/simulator/schema';
import { EquipmentPicker, manualEquipment } from './EquipmentPicker';
import { PotentialPanel } from './PotentialPanel';
import { StarforcePanel } from './StarforcePanel';
import '@/components/ledger/ledger.css';
import './simulator.css';
const tabs = [
  { id: 'potential', name: '잠재능력', icon: '◇' },
  { id: 'additional', name: '에디셔널', icon: '✦' },
  { id: 'starforce', name: '스타포스', icon: '★' },
] as const;
export function SimulatorPage() {
  const [mode, setMode] = useState<'potential' | 'additional' | 'starforce'>('potential');
  const [item, setItem] = useState<Equipment>(manualEquipment),
    [revision, setRevision] = useState(0);
  function select(i: Equipment) {
    setItem(i);
    setRevision((r) => r + 1);
  }
  return (
    <main className="sim-page">
      <header className="sim-header">
        <div>
          <p>MAPLE LAB</p>
          <h1>강화 시뮬레이터</h1>
          <span>내 장비로 미리 해보는 스펙업</span>
        </div>
        <a href="/boss">보스 수익으로 돌아가기 ↗</a>
      </header>
      <nav className="sim-tabs" aria-label="강화 종류">
        {tabs.map((t) => (
          <button key={t.id} aria-pressed={mode === t.id} onClick={() => setMode(t.id)}>
            <span>{t.icon}</span>
            {t.name}
          </button>
        ))}
        <a href="/simulator/cash">캐시 뽑기 ↗</a>
      </nav>
      <div className="sim-layout">
        <aside>
          <EquipmentPicker onSelect={select} />
        </aside>
        <div>
          <section className="sim-selected">
            <div>
              {item.icon ? (
                <img src={item.icon} alt="" width="48" height="48" />
              ) : (
                <span className="sim-item-symbol">◇</span>
              )}
              <span>
                <small>선택한 장비 · Lv.{item.level}</small>
                <h2>{item.name}</h2>
              </span>
            </div>
            <button onClick={() => setRevision((r) => r + 1)}>시뮬레이션 초기화</button>
          </section>
          {mode === 'starforce' ? (
            item.starUnsupported || [2, 3, 4].includes(item.part) ? (
              <section className="sim-panel">
                <h2>일반 스타포스 장비를 선택해 주세요</h2>
                <p>
                  {item.starUnsupported ||
                    '엠블렘·일반 보조무기는 이 강화 모델의 대상이 아닙니다. 강화 가능한 방패 등은 직접 선택해 주세요.'}
                </p>
              </section>
            ) : (
              <StarforcePanel key={mode + revision} item={item} />
            )
          ) : (
            <PotentialPanel key={mode + revision} item={item} mode={mode} />
          )}
        </div>
      </div>
      <footer className="sim-footer">
        가상 강화 결과는 사냥·보스 가계부와 별개이며, 새로고침하면 초기화됩니다.
        <br />
        Data based on NEXON Open API ·{' '}
        <a
          href="https://maplestory.nexon.com/Guide/OtherProbability/cube/black"
          target="_blank"
          rel="noreferrer"
        >
          공식 잠재 확률
        </a>{' '}
        ·{' '}
        <a
          href="https://maplestory.nexon.com/Guide/OtherProbability/cube/addi"
          target="_blank"
          rel="noreferrer"
        >
          공식 에디 확률
        </a>{' '}
        ·{' '}
        <a
          href="https://maplestory.nexon.com/Guide/N23GameInformation/Articles/412"
          target="_blank"
          rel="noreferrer"
        >
          스타포스 안내
        </a>
      </footer>
    </main>
  );
}
