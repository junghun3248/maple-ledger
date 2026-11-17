'use client';
import Image from 'next/image';
import Link from 'next/link';
import { Gem } from 'lucide-react';
import type { BossState, ItemDefinition } from '@/contracts/boss/state';
import { koreaDate } from '@/lib/ledger/korea-date';
import { money } from '@/lib/ledger/format';
import { isResetEve, weeklyLeft } from './weekly-left';
import './weekly-left.css';

/** 수요일(주간 초기화 전날)에만, 아직 안 잡은 보스로 더 받을 수 있는 결정석과 아이템을 한 줄로 알려준다. */
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
  const bosses = left.bosses.map((b) => `${b.character} ${b.difficulty} ${b.name}`).join(', ');
  return (
    <section className="weekly-left" aria-label="이번 주 안 잡은 보스">
      <p className="weekly-left-line">
        진짜 안 도실 건가요?{' '}
        <span className="weekly-left-crystal">
          <Gem size={18} aria-hidden />
          <strong>{eok(left.crystal)}</strong>
        </span>
        {left.drops.length > 0 ? (
          <>
            에{' '}
            <span className="weekly-left-items">
              {left.drops.map((item) => (
                <Image
                  key={item.id}
                  src={item.icon}
                  alt={item.name}
                  title={`${item.name} · ${item.from.join(', ')}`}
                  width={30}
                  height={30}
                  unoptimized
                />
              ))}
            </span>
            을 추가로 얻을 수도 있습니다.
          </>
        ) : (
          <>을 추가로 얻을 수도 있습니다.</>
        )}
      </p>
      <p className="weekly-left-sub">
        오늘 자정 주간 보스 초기화 · <span title={bosses}>남은 보스 {left.bosses.length}개</span>
        {link && (
          <>
            {' '}
            <Link href="/boss">보스 정산 →</Link>
          </>
        )}
      </p>
    </section>
  );
}

/** 1억 이상은 '111.7억'처럼 짧게, 그 아래는 기존 표기 */
function eok(value: bigint) {
  if (value < 100000000n) return money(value) + ' 메소';
  const tenth = Number(value / 10000000n) / 10;
  return tenth.toLocaleString('ko-KR', { maximumFractionDigits: 1 }) + '억';
}
