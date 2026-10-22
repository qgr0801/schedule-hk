export const MIN_PASSWORD = 8;

/** Why a new staff password is not acceptable yet, or null when it is fine. */
export function passwordProblem(pw: string, confirm: string): string | null {
  if (pw.length < MIN_PASSWORD) return `비밀번호는 ${MIN_PASSWORD}자 이상이어야 합니다.`;
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "영문과 숫자를 함께 넣어 주세요.";
  if (pw !== confirm) return "두 비밀번호가 다릅니다.";
  return null;
}
