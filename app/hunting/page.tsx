import { HuntingPage } from '@/features/hunting/HuntingPage';
export const metadata = {
  title: '재획 타이머·사냥 기록',
  description:
    '메이플 가계부 메소저장소에서 게임 화면을 공유해 재획 시간을 재고 버프·야누스·룬과 동꼽을 음성으로 챙기며, 메소와 솔 에르다 조각 수익을 기록하세요.',
  alternates: { canonical: '/hunting' },
};
export default function Page() {
  return <HuntingPage />;
}
