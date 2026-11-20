declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    // Cloudflare Secrets. 헥사 닉네임 검색용 넥슨 키, 건의 게시판 운영자 비밀번호.
    NEXON_API_KEY?: string;
    FEEDBACK_ADMIN_PASSWORD?: string;
  }
}
