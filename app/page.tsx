import { DashboardPage } from '@/features/dashboard/DashboardPage';
export const metadata = {
  title: { absolute: '메소저장소 - 메이플 가계부 | 사냥·보스 수익 기록' },
  alternates: { canonical: '/' },
};
export default function Page() {
  return <DashboardPage />;
}
