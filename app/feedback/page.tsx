import { FeedbackPage } from '@/features/feedback/FeedbackPage';
export const metadata = {
  title: '건의·제보',
  description: '메소저장소에 불편한 점, 버그, 원하는 기능을 남겨 주세요.',
  alternates: { canonical: '/feedback' },
};
export default function Page() {
  return <FeedbackPage />;
}
