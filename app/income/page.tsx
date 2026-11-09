import { IncomePage } from '@/features/income/IncomePage';
export const metadata = {
  title: '메소 수입 추이 · 메소저장소',
  alternates: { canonical: '/income' },
};
export default function Page() {
  return <IncomePage />;
}
