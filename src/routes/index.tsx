import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarCheck2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "로그인 | Beauty Schedule Manager" },
      { name: "description", content: "병원·메디컬뷰티 직원용 예약·스케줄 관리 시스템 로그인" },
      { property: "og:title", content: "Beauty Schedule Manager" },
      { property: "og:description", content: "역할별 권한으로 안전하게 관리하는 예약 캘린더" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) return toast.error("이메일 또는 비밀번호를 확인해 주세요.");
      navigate({ to: "/dashboard" });
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin, data: { full_name: name } },
      });
      setBusy(false);
      if (error) return toast.error(error.message);
      toast.success("가입 확인 메일을 보냈습니다. 메일의 링크를 눌러 인증해 주세요.");
      setMode("login");
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-sidebar p-12 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-2 text-lg font-bold text-sidebar-primary">
          <CalendarCheck2 className="h-6 w-6" /> Beauty Schedule Manager
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
            <CalendarCheck2 className="h-5 w-5" /> Beauty Schedule Manager
          </div>
          <div>
            <h2 className="text-2xl font-bold">{mode === "login" ? "로그인" : "직원 계정 만들기"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "login"
                ? "직원 계정으로 로그인해 주세요."
                : "가입 후 관리자가 역할을 지정합니다. (기본: 외부 직원)"}
            </p>
          </div>
          {mode === "signup" && (
            <div className="space-y-2">
              <Label htmlFor="name">이름</Label>
              <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">이메일</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pw">비밀번호</Label>
            <Input id="pw" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" className="h-11 w-full" disabled={busy}>
            {mode === "login" ? "로그인" : "가입하기"}
          </Button>
          <button
            type="button"
            className="w-full text-center text-sm text-muted-foreground hover:text-primary"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
          >
            {mode === "login" ? "계정이 없으신가요? 가입하기" : "이미 계정이 있으신가요? 로그인"}
          </button>
        </form>
      </div>
    </div>
  );
}
