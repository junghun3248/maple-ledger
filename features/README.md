# 기능별 화면

- `boss/`: 캐릭터 모아보기, API 일괄 가져오기, 클리어 자동 동기화(`auto-sync.ts`, `useBossSync.ts`), 보스 구성, 드롭 선택, 수익 계산, 기록장 동기화
- `dashboard/`: 홈 대시보드 요약과 최근 활동
- `income/`: 사냥·보스 누적 수입 그래프와 목표 ([구성](income/README.md))
- `hunting/`: 전후 사진 입력, OCR 연결, 캘린더, 월 합계, 사냥 기록 동기화
- `hunting/ocr/`: 기존 회귀 테스트를 보존한 이미지 탐지·숫자 판독 엔진. ES 모듈로 지연 로드한다.

페이지 진입점은 `app/`, 공통 기록장 모달은 `components/ledger/`, 날짜·금액 및 API 호출은 `lib/ledger/`에 있다. 각 화면 CSS는 기능 루트에 한정해 화면 전환 시 충돌을 방지한다.
