import { Navigation } from '@/components/ledger/Navigation';
import type { ReactNode } from 'react';
import '@/components/ledger/theme.css';
import type { Metadata } from 'next';
export const metadata: Metadata = {
  metadataBase: new URL('https://maple-ledger.meso-sg.workers.dev'),
  title: {
    default: '메소저장소 - 메이플 가계부 | 사냥·보스 수익 기록',
    template: '%s - 메이플 가계부 메소저장소',
  },
  description:
    '메이플 가계부 메소저장소: 메이플스토리 사냥 메소와 솔 에르다 조각, 보스 결정석·물욕템 수익, 자산과 목표를 무료로 기록하고 정산하세요.',
  keywords: [
    '메이플 가계부',
    '메이플스토리 가계부',
    '메소 가계부',
    '보스 결정석 계산기',
    '보스 수익 계산기',
    '재획 기록',
    '솔 에르다 조각',
    '메소저장소',
  ],
  applicationName: '메소저장소',
  openGraph: {
    siteName: '메소저장소 - 메이플 가계부',
    title: '메소저장소 - 메이플 가계부',
    description: '메이플스토리 사냥·보스 수익과 자산을 기록하는 무료 메이플 가계부',
    locale: 'ko_KR',
    type: 'website',
  },
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* 첫 화면이 그려지기 전에 저장된 테마를 적용해 깜빡임을 막는다. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(siteData) }}
        />
      </head>
      <body>
        <Navigation />
        {children}
      </body>
    </html>
  );
}

const themeScript = `try{var t=localStorage.getItem('maple-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

// 검색 결과에 사이트 이름을 '메소저장소'(메이플 가계부)로 표시하도록 돕는 구조화 데이터
const siteData = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: '메소저장소',
  alternateName: ['메이플 가계부', '메소저장소 메이플 가계부', 'Maple Ledger'],
  url: 'https://maple-ledger.meso-sg.workers.dev/',
  inLanguage: 'ko-KR',
};
