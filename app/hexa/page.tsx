import { HexaPage } from '@/features/hexa/HexaPage';
export const metadata = {
  title: '헥사 계산기',
  description:
    '메이플 가계부 메소저장소의 HEXA 코어 계산기. 넥슨 API로 코어 레벨을 불러와 목표까지 필요한 솔 에르다·조각·메소를 계산해요.',
  alternates: { canonical: '/hexa' },
};
export default function Page() {
  return <HexaPage />;
}
