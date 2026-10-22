import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarCheck2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { staffAppOrigin } from "@/lib/app-url";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "로그인 | Schedule HK" },
      { name: "description", content: "병원·메디컬뷰티 직원용 예약·스케줄 관리 시스템 로그인" },
      { property: "og:title", content: "Schedule HK" },
      { property: "og:description", content: "역할별 권한으로 안전하게 관리하는 예약 캘린더" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  // Accounts are created by an administrator only; there is no self sign-up.
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      toast.error(/banned/i.test(error.message) ? "비활성화된 계정입니다. 관리자에게 문의해 주세요." : "이메일 또는 비밀번호를 확인해 주세요.");
      return;
    }
    navigate({ to: "/dashboard" });
  }

  async function forgot() {
    if (!/^\S+@\S+\.\S+$/.test(email)) { toast.error("위 칸에 이메일을 먼저 입력해 주세요."); return; }
    setBusy(true);
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${staffAppOrigin()}/set-password` });
    setBusy(false);
    // Same message whether or not the address exists, so the form cannot be used to probe accounts.
    toast.success("등록된 이메일이면 비밀번호 재설정 메일이 발송됩니다. 메일함(스팸함 포함)을 확인해 주세요.");
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-sidebar p-12 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-2 text-lg font-bold text-sidebar-primary">
          <CalendarCheck2 className="h-6 w-6" /> Schedule HK
        </div>
        <div>
          <h1 className="text-4xl font-bold leading-tight text-sidebar-primary">
            예약과 스케줄을
            <br />한 곳에서, 안전하게.
          </h1>
          <p className="mt-4 max-w-md text-sidebar-foreground/80">
            월간·주간·일간 캘린더와 직원별 열람 권한으로 병원과 메디컬뷰티 매장의 예약을 관리하세요.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-sidebar-foreground/70">
          <ShieldCheck className="h-4 w-4" /> 역할별 접근 권한은 서버에서 통제됩니다
        </div>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <div className="flex items-center gap-2 font-bold text-primary lg:hidden">
            <CalendarCheck2 className="h-5 w-5" /> Schedule HK
          </div>
          <div>
            <h2 className="text-2xl font-bold">로그인</h2>
            <p className="mt-1 text-sm text-muted-foreground">직원 계정으로 로그인해 주세요.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">이메일</Label>
            <Input id="email" type="email" autoComplete="username" required className="h-11 text-base" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pw">비밀번호</Label>
            <Input id="pw" type="password" autoComplete="current-password" required className="h-11 text-base" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" className="h-11 w-full" disabled={busy}>로그인</Button>
          <button type="button" onClick={forgot} disabled={busy} className="block w-full text-center text-sm font-medium text-primary underline-offset-4 hover:underline">
            비밀번호를 잊으셨나요? 재설정 메일 받기
          </button>
          <p className="text-center text-sm text-muted-foreground">계정이 필요하면 관리자에게 초대를 요청해 주세요.</p>
        </form>
      </div>
    </div>
  );
}
