import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

/** Throws unless the signed-in caller is an admin (checked through their own RLS-scoped client). */
async function assertAdmin(supabase: SupabaseClient<Database>, userId: string) {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
  if (error || data?.role !== "admin") throw new Error("관리자만 사용할 수 있는 기능입니다.");
}

const inviteInput = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  fullName: z.string().trim().min(1).max(40),
  role: z.enum(["internal", "external"]),
  redirectTo: z
    .string()
    .url()
    .refine((u) => {
      const url = new URL(u);
      return (url.protocol === "https:" || url.hostname === "localhost") && url.pathname === "/set-password";
    }, "잘못된 주소입니다."),
});

/** Sends an invitation e-mail; the staff member sets their own password from the link. */
export const inviteStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inviteInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: res, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      data: { full_name: data.fullName },
      redirectTo: data.redirectTo,
    });
    if (error || !res.user) {
      const msg = error?.message ?? "";
      if (/already been registered|already exists/i.test(msg)) throw new Error("이미 등록된 이메일입니다.");
      if (/rate limit/i.test(msg)) throw new Error("초대 메일 발송 한도를 넘었습니다. 잠시 후 다시 시도해 주세요.");
      throw new Error("초대 메일을 보내지 못했습니다. 이메일 주소를 확인해 주세요.");
    }
    // New accounts start as external staff (signup trigger); apply the chosen role.
    if (data.role !== "external") {
      const { error: rErr } = await supabaseAdmin.from("user_roles").update({ role: data.role }).eq("user_id", res.user.id);
      if (rErr) throw new Error("초대는 보냈지만 역할을 바꾸지 못했습니다. 직원 목록에서 역할을 바꿔 주세요.");
    }
    return { id: res.user.id };
  });

/** Turns a staff account on/off: profile flag + sign-in ban, so a deactivated account cannot log in. */
export const setStaffActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid(), active: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if (data.userId === context.userId) throw new Error("본인 계정은 비활성화할 수 없습니다.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: bErr } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: data.active ? "none" : "876000h",
    });
    if (bErr) throw new Error("계정 상태를 바꾸지 못했습니다.");
    const { error } = await supabaseAdmin.from("profiles").update({ is_active: data.active }).eq("id", data.userId);
    if (error) throw new Error("계정 상태를 바꾸지 못했습니다.");
    return { ok: true };
  });

export type AccountState = "invited" | "active" | "disabled";

/** Sign-in state of every staff account (admin only): invited (no password yet), active, disabled. */
export const staffAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 500 });
    if (error) throw new Error("계정 상태를 불러오지 못했습니다.");
    const now = Date.now();
    return data.users.map((u) => {
      const banned = !!u.banned_until && new Date(u.banned_until).getTime() > now;
      // Invited staff count as "invited" until they save a password on /set-password (which sets password_set).
      // Opening the link alone signs them in without a password, so last_sign_in_at is not enough.
      const passwordSet = u.user_metadata?.["password_set"] === true;
      const state: AccountState = banned ? "disabled" : u.invited_at && !passwordSet ? "invited" : "active";
      return { id: u.id, state, invitedAt: u.invited_at ?? null, lastSignInAt: u.last_sign_in_at ?? null };
    });
  });

/** Admin renames a staff member (profiles are not writable from the browser). */
export const renameStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid(), fullName: z.string().trim().min(1).max(40) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("profiles").update({ full_name: data.fullName }).eq("id", data.userId);
    if (error) throw new Error("이름을 바꾸지 못했습니다.");
    return { ok: true };
  });

/**
 * Re-sends a set-password e-mail to an invited staff member who has not saved a password yet.
 * Unaccepted invite -> invite e-mail again; link already opened (account confirmed) -> password-setup (recovery) e-mail.
 */
export const resendSetupLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid(), redirectTo: inviteInput.shape.redirectTo }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: got, error } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    const u = got?.user;
    if (error || !u?.email) throw new Error("직원 계정을 찾지 못했습니다.");
    const res = u.email_confirmed_at
      ? await supabaseAdmin.auth.resetPasswordForEmail(u.email, { redirectTo: data.redirectTo })
      : await supabaseAdmin.auth.admin.inviteUserByEmail(u.email, { redirectTo: data.redirectTo, data: u.user_metadata });
    if (res.error) {
      if (/rate limit/i.test(res.error.message)) throw new Error("메일 발송 한도를 넘었습니다. 잠시 후 다시 시도해 주세요.");
      throw new Error("메일을 보내지 못했습니다.");
    }
    return { kind: u.email_confirmed_at ? ("setup" as const) : ("invite" as const) };
  });
