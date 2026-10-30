export function bookCredentialError(name: string, password: unknown, creating: boolean): string | null {
  if (!name || /[\u0000-\u001f\u007f]/.test(name)) return '기록장 이름을 입력해 주세요. 줄바꿈과 제어 문자는 사용할 수 없어요.';
  if (typeof password !== 'string' || password.length < (creating ? 9 : 1) || password.length > 128) return creating ? '비밀번호는 9~128자로 입력해 주세요.' : '기록장 비밀번호를 입력해 주세요.';
  return null;
}
