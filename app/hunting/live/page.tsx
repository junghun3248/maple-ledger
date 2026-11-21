import { LiveHelper } from '@/features/hunting/live/LiveHelper';
export const metadata = {
  title: '재획 타이머',
  description: '메소저장소 재획 타이머로 사냥 시간과 재획비 같은 버프 시간을 알림으로 챙기세요.',
  alternates: { canonical: '/hunting/live' },
};
export default function Page() {
  return <LiveHelper />;
}
