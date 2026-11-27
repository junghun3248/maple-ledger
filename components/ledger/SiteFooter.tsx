/** 모든 페이지 맨 아래에 보이는 문의 연락처. 사용자 요청(2026-11-27)으로 운영자 메일을 공개한다. */
const CONTACT = 'wkdwndgns17@gmail.com';

export function SiteFooter() {
  return (
    <footer className="site-footer">
      문의·오류 제보: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
    </footer>
  );
}
