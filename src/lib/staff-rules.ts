/** Pure staff-account rules shared by the server functions, the staff screen and tests. */

/** Invite links stop working after this long (auth e-mail link lifetime). */
export const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * invited  = invite sent, link not used yet and still valid (초대 대기)
 * expired  = invite sent, link not used and older than INVITE_TTL_MS (초대 만료)
 * pending  = link opened but no password saved yet (비밀번호 미설정)
 * active   = can sign in (초대 수락 or created directly)
 * disabled = sign-in banned
 */
export type AccountState = "invited" | "expired" | "pending" | "active" | "disabled";

export function inviteState(
  u: { bannedUntil: string | null; invitedAt: string | null; confirmedAt: string | null; passwordSet: boolean },
  now: number,
): AccountState {
  if (u.bannedUntil && new Date(u.bannedUntil).getTime() > now) return "disabled";
  if (!u.invitedAt || u.passwordSet) return "active";
  if (u.confirmedAt) return "pending";
  return now - new Date(u.invitedAt).getTime() > INVITE_TTL_MS ? "expired" : "invited";
}

export const ACCOUNT_LABEL: Record<AccountState, string> = {
  invited: "초대 대기",
  expired: "초대 만료",
  pending: "비밀번호 미설정",
  active: "활성",
  disabled: "비활성",
};

export type LinkCounts = Record<string, number>;

/** Permanent delete is allowed only for accounts with nothing linked to them. */
export function canDeleteAccount(links: LinkCounts | null | undefined): boolean {
  return !!links && Object.values(links).every((n) => n === 0);
}
