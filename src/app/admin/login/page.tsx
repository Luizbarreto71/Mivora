import type { Metadata } from "next";
import { Logo } from "@/components/brand/logo";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-10 flex flex-col items-center gap-3">
          <span className="h-20">
            <Logo variant="lockup" className="h-full" />
          </span>
          <p className="text-[0.625rem] font-semibold uppercase tracking-[0.22em] text-muted">Painel administrativo</p>
        </div>
        <div className="rounded-lg border border-line bg-paper p-6 sm:p-8">
          <LoginForm />
        </div>
        <p className="mt-6 text-center text-xs text-muted">Acesso restrito a administradores autorizados.</p>
      </div>
    </main>
  );
}
