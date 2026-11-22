# 기능별 화면

- `boss/`: 캐릭터 모아보기, API 일괄 가져오기, 클리어 자동 동기화(`auto-sync.ts`, `useBossSync.ts`), 보스 구성, 드롭 선택, 수익 계산, 기록장 동기화
- `dashboard/`: 홈 대시보드 요약과 최근 활동
- `income/`: 사냥·보스 누적 수입 그래프와 목표 ([구성](income/README.md))
- `hexa/`: 헥사 계산기. 코어 비용표(`costs.ts`), 필요 재료·도달 레벨 계산(`model.ts`), HEXA 매트릭스 판(`HexaBoard.tsx`), 화면(`HexaPage.tsx`)
- `starforce/`: 스타포스 기대 비용 계산기. 확률·1회 비용·파괴 복구·기댓값과 시뮬레이션(`model.ts`), 화면과 목표 등록(`StarforcePage.tsx`)
- `feedback/`: 건의·제보 게시판 화면과 운영자 답글·삭제
- `hunting/`: 재획 타이머를 맨 위에 둔 사냥 기록 화면, 기록 입력, 캘린더, 월 합계, 사냥 기록 동기화. 스크린샷 업로드 입력은 화면 공유 스냅샷으로 대체해 없앴다.
- `hunting/live/`: 재획 타이머(PC 전용). 세션 시간과 저장값(`session.ts`), 알림 대사(`public/voice/*.wav`, Supertonic 3 AI 음성) 재생·브라우저 알림·Worker 틱(`notify.ts`), 사냥 기록 화면에 들어가는 패널(`LivePanel.tsx`). 버프·야누스·부스터·룬 알림은 화면 공유로 감지한다(`ScreenWatch.tsx`, `capture/`: 공유·프레임·영역 고르기·숫자 읽기(`timeReader.ts`), `detectors/`: 아이콘 비교·숫자 마스크·룬 색(`template.ts`), 10초 전 알림 판단(`countdown.ts`), 시간 기준 판정(`state.ts`)). 프레임은 브라우저 안에서만 처리한다.
- `hunting/ocr/`: 메소·조각 칸 탐지·숫자 판독 엔진. 화면 공유 스냅샷과 남은 시간 읽기에서 지연 로드한다.

페이지 진입점은 `app/`, 공통 기록장 모달은 `components/ledger/`, 날짜·금액 및 API 호출은 `lib/ledger/`에 있다. 각 화면 CSS는 기능 루트에 한정해 화면 전환 시 충돌을 방지한다.
