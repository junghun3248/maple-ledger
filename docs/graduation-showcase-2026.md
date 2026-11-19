# 2026 졸업작품 전시 참고 노트

2026-11-19 사용자가 학과 졸업작품 전시에서 본 포스터 9개를 정리한 참고 자료다.
제작자 이름·학번은 공개 저장소라 적지 않는다. 사이트·게임 작업과 발표 자료를 만들 때 참고한다.

## 포스터 형식

모든 포스터가 같은 틀을 쓴다.

1. 제목 + 한 줄 부제 (`:` 뒤에 무엇을 하는 작품인지)
2. OVERVIEW: 문제 → 해결 → 핵심 기능
3. EXPECTANCY EFFECTS: 사용자가 얻는 효과
4. SYSTEM ARCHITECTURE & DEVELOPMENT ENVIRONMENT: 구성도 + 개발 환경
5. 하단: 실행 화면 스크린샷, 결과 수치·그래프

## 작품 요약

| 작품 | 핵심 | 스택 | 눈에 띈 점 |
|---|---|---|---|
| Cozy Cast | 집중한 시간이 낚시 보상이 되는 데스크톱 상주 게임 | Unity(C#), ASP.NET Core, SignalR, PostgreSQL, Docker | 투명 오버레이, 입력·활성 창 감지로 방치 보상 억제, 서버가 보상 확정, 친구와 실시간 "함께 항해", 웹 대시보드·주간 순위, 꾸미기·도감 |
| ScholarMind | 내장 그래픽만으로 도는 로컬 RAG 논문 요약 | Python, Streamlit, Ollama EXAONE 3.5 2.4B, FAISS+BM25(RRF) | "GPU 없음"을 장점으로 내세움, 출처 표시·수치 불일치 자동 경고 |
| ProjectMate | 팀 프로젝트 일정·역할·업무 관리 앱 | Kotlin, Firebase Auth/RTDB, Cloudinary | 초대코드, 작업물 제출→검토→승인·반려 흐름, 회의 시간 투표 |
| 메이플 전투력·강화 비용 분석 | NEXON Open API로 강화 효과·비용 기댓값 계산, 강화 순서 추천 | React/TS, Vinext, Cloudflare Workers | 효율 = 전투력 증가량 ÷ 비용 기댓값 × 1억, 최고 효율 후보 적용 후 재계산 |
| 이기종 분산처리 | PC·노트북·폰에 ResNet-50 추론 분산 | PyTorch, Flask, Android Termux | RTT/EWMA 동적 분배, FP16 전송, 분산이 유리해지는 조건을 그래프로 제시 |
| PawLog | 반려견 무인 급식·급수 + AI로 실제 섭취 확인 | Raspberry Pi 4B, YOLOv8n(ncnn), Flask, Next.js, Supabase, Cloudflare Tunnel | 영상은 기기 안에서만 분석(사생활·구독료), 모바일 원격 제어, mAP50 93.9% |
| MobileNetV2 가속기 | Inverted Residual Block(Layer08) FPGA RTL 구현 | Verilog | 곱셈기 공유로 DSP 65→37, BRAM 94→63, 300MHz 타이밍 충족, 골든 모델 12,544개 출력 일치 |
| Minecraft LLM 에이전트 | 한국어 목표("화로 만들어 설치해줘")를 재료 수집부터 설치까지 수행 | Python, Ollama Qwen3, Node.js Mineflayer | 관찰→후보 구성→LLM 선택→실행→검증 반복, 실행 횟수·오류·복구를 기록 |
| AI 운동 자세 코치 | 웹캠 하나로 운동 인식, 반복마다 틀린 부위에 빨간 원 | MediaPipe Pose, MLP+TCN, PyTorch, HTML/JS | 확신 없으면 표시 안 함, 93% 인식률·0.3초 판정·30ms 처리 등 지표 카드 |

## 배울 점

- **문제를 한 줄로 먼저 잡는다.** "생산성 앱은 지루하고 게임은 작업을 방해한다"처럼.
- **결과를 숫자로 보여준다.** 인식률, 처리 시간, 자원 절감, 비용처럼 비교 가능한 수치가 가장 설득력 있었다.
- **제약을 장점으로 바꾼다.** GPU 없음, 센서 없이 웹캠 하나, 클라우드로 영상 미전송.
- **믿을 수 있는 결과를 설계한다.** 서버 검증(Cozy Cast), 출처 표시(ScholarMind), 확신 없으면 보류(자세 코치).
- **화면이 많을수록 잘 읽힌다.** 텍스트 위주 포스터보다 스크린샷 위주가 한눈에 들어왔다.
- **실제 데모를 옆에 둔다.** 대부분 노트북으로 바로 실행해 보여줬다.

## 이 사이트(maple-ledger)에 쓸 만한 것

- 같은 전시의 메이플 강화 분석 작품과 스택(Vinext, Cloudflare Workers)이 같다. 강화 비용 화면은 "비용 대비 효율 순 추천" 관점을 참고할 수 있다.
- 기록·통계 화면은 Cozy Cast의 시간대별 분석·주간 순위처럼 "모은 데이터를 다시 보여주는" 방향이 재방문 동기가 된다.
- 계산 결과에는 근거(확률표 출처, 계산식)를 함께 보여 신뢰를 높인다.
