# 수입·목표

`/income`에서 기록장에 저장된 사냥·보스 기록을 그래프로 보고 목표를 관리합니다.

- `IncomeGoalsPage.tsx`: 페이지 조립 (목표 → 수입 그래프)
- `GoalsPanel.tsx`: 나의 다음 목표 카드, 목표 카드, 만들기·수정 대화상자(시작일 포함)
- `IncomeChart.tsx`: 7일~1년 누적 수입 그래프(사냥·보스·전체)와 날짜별 금액
- `model.ts`: 날짜별 사냥 차액·보스 정산액 누적 계산
- `asset-model.ts`: 날짜별 수입(`dailyIncome`), 목표별 시작일~오늘 수입(`goalEarned`·`goalEarnings`), 진행률(`goalProgress`), 다음 목표(`nextGoal`), 예상 기간 계산. 홈·목표·예상 기간이 같은 수입 기준을 쓴다.
- `useAssetLedger.ts`: 기록장 조회·저장(`finance-read`/`finance-save`)

목표마다 `startDate`(KST)를 저장하고, 그날부터 기록된 사냥 전후 차액과 보스 정산액만 그 목표의 진행률에 더합니다. 시작일이 없는 예전 목표는 오늘부터 셉니다(수정에서 바꿀 수 있음). 예전 자산·지출 화면에서 저장한 지출·잔액 조정·판매·보유 메소 값은 DB에 그대로 남아 있지만 화면과 계산에서는 쓰지 않습니다.
