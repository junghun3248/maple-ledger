import { BossPage } from '@/features/boss/BossPage';
import bosses from '@/public/bosses.json';
import items from '@/public/boss-items.json';
import drops from '@/public/boss-drops.json';
import type { BossDefinition } from '@/contracts/boss/state';
export const metadata = { title: '보스 수익 계산기 · 메이플 가계부' };
export default function Page() {
  const catalog: BossDefinition[] = bosses.map((b) => ({
    ...b,
    period: b.period === 'month' ? 'month' : 'week',
  }));
  return <BossPage catalog={catalog} items={items} rules={drops.rules} />;
}
