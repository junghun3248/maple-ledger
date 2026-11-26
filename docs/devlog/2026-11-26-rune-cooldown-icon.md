# 2026-11-26 재획 타이머: 룬 알림을 룬 쿨타임 아이콘으로

작성: Claude

## 내용

- 사용자 요청으로 룬 알림을 미니맵의 룬 표시 대신, 룬을 해방한 뒤 버프 칸에 뜨는 룬 쿨타임 아이콘(예: `4:40`)으로 바꿨습니다. 버프·야누스와 같이 아이콘을 한 번 등록하면 화면 위쪽 절반에서 찾아 남은 시간을 읽고, 쿨타임이 끝날 때(2초 남았을 때, 아이콘이 사라지기 전) "룬 쓸 수 있어요"라고 알립니다. 사냥터가 바뀌어도 다시 등록하지 않아도 됩니다.
- 새 음성 `public/voice/runeReady.wav`("룬 쓸 수 있어요", 1.07초)는 기존 대사와 같은 Supertone Supertonic 3 F1 목소리·설정으로 작업 PC에서 만들었습니다(`E:\Codex\voice-work\scripts\generate_rune_ready.py`).
- 예전에 미니맵으로 등록한 룬은 지우지 않으면 그대로 미니맵 방식으로 동작합니다. 새로 등록하는 룬은 모두 아이콘 방식입니다.
- 사용 안내 내용이 바뀌어 "다시 보지 않기" 저장 키를 v3으로 올렸습니다.

## 파일

- `features/hunting/live/ScreenWatch.tsx`: 룬 등록 단계·감지·상태 문구
- `features/hunting/live/detectors/countdown.ts`: 알림 시점(`alertAt`, `RUNE_ALERT_AT`)
- `features/hunting/live/notify.ts`, `features/hunting/live/LiveGuide.tsx`, `public/voice/runeReady.wav`
- `tests/live-detector.test.ts`

## DB 마이그레이션

필요 없습니다.

검증: 타입 검사, ESLint, Prettier, 테스트 151개, Cloudflare 빌드 통과. 개발 서버에서 바뀐 안내와 음성 파일(200, audio/wav)을 확인했습니다. 실제 룬 쿨타임 아이콘 등록과 알림은 아직 사용자 PC에서 확인하지 못했습니다.
