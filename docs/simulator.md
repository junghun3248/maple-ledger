# 강화 시뮬레이터

`/simulator`에서 잠재능력, 에디셔널 잠재능력, 스타포스를 각각 실행한다.
닉네임과 넥슨 API 키로 장착 장비를 가져오거나 부위·레벨을 직접 선택한다.

## 기능과 경계

- 잠재·에디: 공식 확률표 기반 세 줄 추첨, 등급 상승 보장, 미라클 타임, 전후 옵션 선택, 누적 비용과 최근 결과.
- 자동 재설정: 레전드리 또는 선택한 옵션 합계를 목표로 실행. 추가 예산·1,000회 한도·사용자 중단 중 하나에 도달하면 멈춘다.
- 스타포스: 목표 단계, 파괴 방지, 성공 이벤트, 파괴율 감소, MVP 및 비용 할인, 파괴 후 복구와 비용 합산.
- 강화 비용은 일반 KMS 장비 추정식이다. 단계별 실제 비용을 입력하면 추정값을 덮어쓴다.
- 흔적 단계 그대로 복구하는 메소 비용은 게임 표시값을 직접 입력한다. 장비 구매가가 빠진 복구는 합계 누락을 표시한다.
- 슈페리얼·놀장·제로·아스트라·데스티니 등 특수 강화는 지원하지 않는다. 잠재 옵션 고정 및 MVP 3회 재설정도 미지원이다.
- 가상 결과는 브라우저 메모리에만 존재한다. 탭·장비 변경, 초기화, 새로고침 시 초기화한다. 기록장 DB나 실제 게임 장비를 수정하지 않는다.
- API 키는 요청 헤더로 넥슨에 전달하며 응답·DB에 포함하지 않는다. 기존에 저장한 키를 재사용하며 새 키 저장은 사용자 선택이다.

## 구조

- `contracts/simulator`: 요청 검증, 장비·확률표 계약
- `server/simulator`: 넥슨 장비 조회, 공식 확률 HTML 파싱과 캐시
- `features/simulator`: 가상 강화 엔진과 화면
- `app/simulator`: 페이지 진입점
- `tests/simulator.test.ts`: 확률·등업 보장·비용·복구·장비 API 매핑 회귀 검사

## 데이터 근거

- [잠재 확률](https://maplestory.nexon.com/Guide/OtherProbability/cube/black)
- [에디셔널 확률](https://maplestory.nexon.com/Guide/OtherProbability/cube/addi)
- [잠재 메소 비용](https://maplestory.nexon.com/news/update/737)
- [에디셔널 메소 비용](https://m.maplestory.nexon.com/News/Update/746)
- [스타포스 확률 개편](https://maplestory.nexon.com/news/update/767)
- [스타캐치 및 흔적 복구 개편](https://maplestory.nexon.com/news/update/799)
- [비용식 측정 자료](https://www.inven.co.kr/board/maple/5974/4775145), [계산기 작성자의 비용식](https://github.com/acyr0/starforce/blob/main/src/lib/calcs.ts)

비용식은 게임 수학 규칙을 참고해 독립 구현했다. 공식 확률표를 가져오지 못하면 오류를 표시하며 임의 확률로 대신 실행하지 않는다.
