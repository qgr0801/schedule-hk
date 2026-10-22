import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarCheck2, KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MIN_PASSWORD, passwordProblem } from "@/lib/password";

export const Route = createFileRoute("/set-password")({
  head: () => ({
    meta: [
      { title: "비밀번호 설정 | Schedule HK" },
      { name: "description", content: "초대받은 직원이 Schedule HK 계정의 비밀번호를 직접 설정합니다." },
      { property: "og:title", content: "비밀번호 설정 | Schedule HK" },
      { property: "og:description", content: "초대 메일의 링크로 들어와 내 비밀번호를 정합니다." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SetPasswordPage,
});

type Phase = "checking" | "ready" | "invalid" | "done";

function SetPasswordPage() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("checking");
  const [who, setWho] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  // Signed-in password changes (not from an e-mail link) must include the current password.
  const [needCurrent, setNeedCurrent] = useState(false);
  const [current, setCurrent] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      if (hash.get("error") || hash.get("error_code")) { if (alive) setPhase("invalid"); return; }
      const access = hash.get("access_token");
      const refresh = hash.get("refresh_token");
      if (access && refresh) {
        const { error } = await supabase.auth.setSession({ access_token: access, refresh_token: refresh });
        window.history.replaceState(null, "", window.location.pathname);
        if (error) { if (alive) setPhase("invalid"); return; }
      }
      const { data } = await supabase.auth.getUser();
      if (!alive) return;
      if (!data.user) { setPhase("invalid"); return; }
      setWho((data.user.user_metadata?.["full_name"] as string | undefined) || data.user.email || "");
      setPhase("ready");
    })();
    return () => { alive = false; };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = passwordProblem(pw, pw2);
    if (problem) { toast.error(problem); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser(
      needCurrent ? { password: pw, current_password: current, data: { password_set: true } } : { password: pw, data: { password_set: true } },
    );
    setBusy(false);
    if (error?.code === "current_password_required") {
      setNeedCurrent(true);
      toast.error("보안을 위해 현재 비밀번호를 함께 입력해 주세요.");
      return;
    }
    if (error && needCurrent && /invalid|incorrect|current password/i.test(error.message)) {
      toast.error("현재 비밀번호가 맞지 않습니다.");
      return;
    }
    if (error) {
      toast.error(error.code === "same_password" || /different from the old/i.test(error.message) ? "이전과 다른 비밀번호를 입력해 주세요." : "비밀번호를 저장하지 못했습니다. 다시 시도해 주세요.");
      return;
    }
    setPhase("done");
    toast.success("비밀번호를 저장했습니다.");
    navigate({ to: "/calendar", replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted p-6">
      <div className="w-full max-w-sm space-y-5 rounded-xl border bg-card p-6 shadow-card">
        <div className="flex items-center gap-2 font-bold text-primary">
          <CalendarCheck2 className="h-5 w-5" /> Schedule HK
        </div>
        {phase === "checking" && <p className="text-sm text-muted-foreground">링크를 확인하는 중…</p>}
        {phase === "invalid" && (
          <div className="space-y-3">
            <h1 className="text-xl font-bold">링크가 만료되었거나 잘못되었습니다</h1>
            <p className="text-sm text-muted-foreground">관리자에게 초대 메일을 다시 요청하거나, 로그인 화면의 '비밀번호 재설정'을 이용해 주세요.</p>
            <Button variant="outline" className="h-11 w-full" onClick={() => navigate({ to: "/" })}>로그인 화면으로</Button>
          </div>
        )}
        {(phase === "ready" || phase === "done") && (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <h1 className="flex items-center gap-2 text-xl font-bold"><KeyRound className="h-5 w-5 text-primary" /> 비밀번호 설정</h1>
              <p className="mt-1 text-sm text-muted-foreground">{who && <b className="text-foreground">{who}</b>}{who && "님, "}앞으로 로그인할 때 쓸 비밀번호를 정해 주세요.</p>
            </div>
            {needCurrent && (
              <div className="space-y-2">
                <Label htmlFor="cur-pw">현재 비밀번호</Label>
                <Input id="cur-pw" type="password" autoComplete="current-password" required className="h-11 text-base" value={current} onChange={(e) => setCurrent(e.target.value)} />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="new-pw">새 비밀번호</Label>
              <Input id="new-pw" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} className="h-11 text-base" value={pw} onChange={(e) => setPw(e.target.value)} />
              <p className="text-xs text-muted-foreground">{MIN_PASSWORD}자 이상, 영문과 숫자를 함께 넣어 주세요.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-pw2">비밀번호 확인</Label>
              <Input id="new-pw2" type="password" autoComplete="new-password" required className="h-11 text-base" value={pw2} onChange={(e) => setPw2(e.target.value)} />
            </div>
            <Button type="submit" className="h-11 w-full" disabled={busy || phase === "done"}>비밀번호 저장</Button>
          </form>
        )}
      </div>
    </div>
  );
}
