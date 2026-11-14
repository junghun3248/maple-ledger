import { HuntingPage } from '@/features/hunting/HuntingPage';
export const metadata = {
  title: '사냥 메소·조각 기록',
  description:
    '메이플 가계부 메소저장소에서 사냥 전후 스크린샷으로 메소와 솔 에르다 조각 수익을 기록하세요.',
  alternates: { canonical: '/hunting' },
};
export default function Page() {
  return <HuntingPage />;
}
