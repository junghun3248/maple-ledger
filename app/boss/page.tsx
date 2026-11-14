import { BossPage } from '@/features/boss/BossPage';
import bosses from '@/public/bosses.json';
import items from '@/public/boss-items.json';
import drops from '@/public/boss-drops.json';
import type { BossDefinition } from '@/contracts/boss/state';
export const metadata = {
  title: '보스 결정석 수익 계산기',
  description:
    '메이플 가계부 메소저장소의 주간·월간 보스 결정석 수익 계산기. 넥슨 API로 캐릭터와 클리어 기록을 자동으로 불러와요.',
  alternates: { canonical: '/boss' },
};
export default function Page() {
  const catalog: BossDefinition[] = bosses.map((b) => ({
    ...b,
    period: b.period === 'month' ? 'month' : 'week',
  }));
  return <BossPage catalog={catalog} items={items} rules={drops.rules} />;
}
