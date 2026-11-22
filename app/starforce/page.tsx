import { StarforcePage } from '@/features/starforce/StarforcePage';
export const metadata = {
  title: '스타포스 기대 비용',
  description:
    '메이플 가계부 메소저장소의 스타포스 기대 비용 계산기. 지금 별에서 목표 별까지 평균 메소·파괴 횟수를 계산하고 목표 금액으로 등록해요.',
  alternates: { canonical: '/starforce' },
};
export default function Page() {
  return <StarforcePage />;
}
