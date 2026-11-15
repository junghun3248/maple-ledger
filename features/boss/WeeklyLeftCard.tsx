'use client';
import Image from 'next/image';
import Link from 'next/link';
import type { BossState, ItemDefinition } from '@/contracts/boss/state';
import { koreaDate } from '@/lib/ledger/korea-date';
import { money } from '@/lib/ledger/format';
import { isResetEve, weeklyLeft } from './weekly-left';
import './weekly-left.css';

/** 수요일(주간 초기화 전날)에만, 아직 안 잡은 보스와 남은 결정석·획득 가능 아이템을 보여준다. */
export function WeeklyLeftCard({
  state,
  items,
  rules,
  link = false,
}: {
  state: BossState;
  items: ItemDefinition[];
  rules: Record<string, string[]>;
  link?: boolean;
}) {
  const today = koreaDate();
  if (!isResetEve(today)) return null;
  const left = weeklyLeft(state, today, items, rules);
  if (!left.bosses.length) return null;
  return (
    <section className="weekly-left" aria-label="이번 주 안 잡은 보스">
      <div className="weekly-left-head">
        <span className="weekly-left-kicker">오늘 자정 주간 보스 초기화</span>
        {link && <Link href="/boss">보스 정산 →</Link>}
      </div>
      <h2>
        안 잡은 보스 {left.bosses.length}개 · 결정석 <strong>{money(left.crystal)} 메소</strong>{' '}
        획득 가능
      </h2>
      <ul className="weekly-left-bosses">
        {left.bosses.map((b, i) => (
          <li key={b.character + b.name + b.difficulty + i}>
            <span>{b.character}</span>
            {b.difficulty} {b.name}
            <small>{money(b.crystal)}</small>
          </li>
        ))}
      </ul>
      {left.drops.length > 0 && (
        <>
          <h3>획득 가능한 아이템</h3>
          <ul className="weekly-left-items">
            {left.drops.map((item) => (
              <li key={item.id} title={item.from.join(', ')}>
                <Image src={item.icon} alt="" width={28} height={28} unoptimized />
                <span>
                  {item.name}
                  <small>{item.from.join(', ')}</small>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
