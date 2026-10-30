# 목표 아키텍처

app은 라우팅과 HTTP 진입점, features는 기능별 React UI·상태·순수 모델, server는 서버 서비스, contracts는 공유 요청·응답·Zod 검증을 담당한다. db는 DB 연결 및 스키마, lib는 비종속 공통 유틸리티를 맡는다.

Next.js App Router를 주 규약으로 사용한다. 기존 Vinext/Vite는 Cloudflare 배포를 위한 호환 빌드 계층으로 유지하며 별도 React 앱이나 중복 빌드 경로를 추가하지 않는다.

TypeScript 내부 import는 @/ 별칭을 우선한다. 아직 번들링하지 않는 public 브라우저 모듈에는 브라우저가 해석할 수 없는 별칭을 넣지 않는다. Node 직접 실행 테스트와 서버 모듈의 경로 호환성을 함께 확인한다.

서버의 세션·DB 접근은 클라이언트에서 import하지 않는다. DB 모델과 공개 응답 타입은 별도로 정의한다. 실제 파일 이동 시에만 디렉터리를 생성한다.
