# 개인 Cloudflare 배포

## 구성

- 공개 코드와 개발일지: GitHub 저장소
- 화면과 API: Cloudflare Worker (Vinext / Next.js App Router)
- 기록장, 세션, 사냥 및 보스 기록: D1의 DB 바인딩
- 새 사이트: https://maple-ledger.meso-sg.workers.dev
- ChatGPT 로그인 없이 기록장 이름과 비밀번호로 사용합니다.

## 빌드와 배포

Node.js 22.15 이상 및 기존 npm 의존성을 사용합니다.

1. Wrangler로 본인 Cloudflare 계정에 로그인합니다.
2. 새 계정에서는 D1을 만들고 wrangler.cloudflare.json의 database_id를 교체합니다.
3. npm run db:migrate:cloudflare 로 원격 DB 스키마를 적용합니다.
4. npm run build:cloudflare 로 독립 배포용 파일을 빌드합니다.
5. npm run deploy:cloudflare 로 직전 빌드를 배포합니다.

Sites용 npm run build와 독립 배포용 빌드는 dist를 공유하므로 배포 직전에
반드시 build:cloudflare를 실행합니다. 독립 빌드는 Sites 인증과 커넥터 플러그인을
포함하지 않습니다. 기존 Sites 배포와 데이터베이스는 변경하지 않습니다.

무료 요금제에서 시작하며 유료 요금제로 자동 전환하는 설정을 추가하지 않습니다.
사용량과 CPU 한도는 Cloudflare 대시보드에서 확인합니다.

## GitHub Actions 자동 배포

main에 병합되면 `.github/workflows/deploy-cloudflare.yml`이 검사 후 빌드·배포합니다.
GitHub 저장소 Settings → Secrets and variables → Actions에 다음 두 값을 등록합니다.

- `CLOUDFLARE_API_TOKEN`: Cloudflare의 "Edit Cloudflare Workers" 템플릿으로 만든 토큰
- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare 대시보드의 계정 ID

시크릿이 없으면 배포 단계는 건너뛰므로 위의 수동 배포를 사용합니다.
DB 마이그레이션은 자동 적용하지 않으며 병합 전에 수동으로 적용합니다.

## 기존 기록 옮기기

서로 다른 DB이므로 기존 기록장이나 비밀번호가 자동으로 복제되지는 않습니다.

1. 기존 사이트에서 기록장을 엽니다.
2. 사냥 화면의 내 기록 보관함 → 백업으로 사냥 기록을 내보냅니다.
3. 보스 화면의 데이터 → 파일로 내보내기로 보스 기록을 내보냅니다.
4. 새 사이트에서 기록장을 새로 만듭니다. 기존과 같은 이름을 사용할 수 있습니다.
5. 사냥 화면의 복원으로 사냥 백업을 가져옵니다.
6. 보스 화면의 데이터 → 파일에서 가져오기 후 기록장에 저장을 누릅니다.
7. 새로고침 및 다른 기기에서 기록장을 열어 내용이 일치하는지 확인합니다.

백업 파일은 개인 기록이므로 공개 GitHub에 올리지 않습니다.
넥슨 API 키와 브라우저 임시 기록은 주소가 바뀌면 자동 이동하지 않습니다.
API 키는 새 사이트에서 다시 입력하고, 기존 사이트는 확인이 끝날 때까지 유지합니다.
