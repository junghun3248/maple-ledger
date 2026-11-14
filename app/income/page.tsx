import { AssetPage } from '@/features/income/AssetPage';
export const metadata = {
  title: '자산·지출·목표 관리',
  description: '메이플 가계부 메소저장소에서 메소 잔액, 지출, 목표 달성률을 관리하세요.',
  alternates: { canonical: '/income' },
};
export default function Page() {
  return <AssetPage />;
}
