import { IncomeGoalsPage } from '@/features/income/IncomeGoalsPage';
export const metadata = {
  title: '수입 그래프·목표',
  description:
    '메이플 가계부 메소저장소에서 사냥·보스 메소 수입 그래프와 목표 달성률을 확인하세요.',
  alternates: { canonical: '/income' },
};
export default function Page() {
  return <IncomeGoalsPage />;
}
