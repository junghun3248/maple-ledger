export const json = (data: unknown, status = 200, headers = {}) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } });

/** 다른 탭에서 기록장을 바꿔 연 뒤 이전 화면에서 저장하면 다른 기록장을 덮어쓰지 않도록 막는다. */
export const bookChanged = () =>
  json({ error: '열린 기록장이 바뀌었습니다. 새로고침 후 다시 저장해 주세요.' }, 409);
