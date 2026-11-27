import { notFound } from 'next/navigation';
import { PageHeading } from '@/components/ledger/PageHeading';
import { WeaponStats } from '@/features/weapon-stats/WeaponStats';
import { weaponStatsSnapshot } from '@/contracts/weapon-stats/schema';
import snapshot from '@/public/weapon-stats.json';
import './weapon-stats.css';

/** 사용자 요청(2026-11-27): Lv.275 이상 전체 수집이 끝날 때까지 페이지와 메뉴를 숨긴다. */
const PUBLISHED = false;

export const metadata = {
  title: '해방 무기 통계',
  description: '메이플스토리 종합 랭킹 기준 제네시스·데스티니 해방률과 직업별 에공삼·에마삼 비율.',
  alternates: { canonical: '/weapon-stats' },
};

export default function WeaponStatsPage() {
  if (!PUBLISHED) notFound();
  const stats = weaponStatsSnapshot.safeParse(snapshot).data;
  return (
    <main className="weapon-stats">
      <PageHeading
        title="해방 무기 통계"
        description="제네시스·데스티니 해방률과 직업별 무기 에디 비교"
      />
      <WeaponStats stats={stats} />
    </main>
  );
}
