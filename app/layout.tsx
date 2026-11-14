import { Navigation } from '@/components/ledger/Navigation';
import type { ReactNode } from 'react';
import '@/components/ledger/theme.css';
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
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* 첫 화면이 그려지기 전에 저장된 테마를 적용해 깜빡임을 막는다. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Navigation />
        {children}
      </body>
    </html>
  );
}

const themeScript = `try{var t=localStorage.getItem('maple-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;
