import { Navigation } from '@/components/ledger/Navigation';
import type { ReactNode } from 'react';
import type { Metadata } from 'next';
export const metadata: Metadata = {
  metadataBase: new URL('https://maple-ledger.meso-sg.workers.dev'),
  description:
    '메소저장소는 메이플스토리 사냥 메소와 솔 에르다 조각, 보스 결정석과 물욕템 수익을 기록하는 가계부입니다.',
  applicationName: '메소저장소',
  openGraph: { siteName: '메소저장소', locale: 'ko_KR', type: 'website' },
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <Navigation />
        {children}
      </body>
    </html>
  );
}
