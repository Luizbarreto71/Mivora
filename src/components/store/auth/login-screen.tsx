"use client";

import { Check, Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { buttonClasses } from "@/components/ui/button";
import { getSessionSummary, type SessionSummary } from "@/lib/auth/actions";
import { signOutAccount } from "@/lib/store/account-actions";
import { LoginForm } from "./login-form";

const NOTICES = {
  "other-device": "Se você confirmou o e-mail em outro aparelho, sua conta já está ativa: entre com seu e-mail e senha.",
  error: "Não foi possível entrar agora. Tente de novo.",
  cancelled: "O login foi cancelado. Você pode tentar de novo ou entrar com seu e-mail.",
} as const;

const BENEFITS = ["Acompanhe seus pedidos e pagamentos", "Endereços e dados salvos para comprar mais rápido", "Relatórios da análise de pele guardados na sua conta"];

/** /entrar: "JÁ TEM UMA CONTA?" beside the invitation to create one. */
export function LoginScreen({ next, notice }: { next: string; notice: keyof typeof NOTICES | null }) {
  const [session, setSession] = useState<SessionSummary | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    getSessionSummary()
      .catch(() => null)
      .then((s) => !cancelled && setSession(s));
    return () => {
      cancelled = true;
    };
  }, []);

  if (session === undefined) return <div className="mx-auto h-96 max-w-4xl animate-pulse bg-ivory" aria-busy="true" />;
  if (session) {
    return (
      <div className="mx-auto max-w-md border border-line p-8 text-center">
        <p className="text-sm text-muted">Você já está conectada como</p>
        <p className="mt-1 break-all font-semibold">{session.email}</p>
        <div className="mt-6 grid gap-3">
          <Link href={next} className={buttonClasses("primary", "lg", "w-full")}>
            Continuar
          </Link>
          <button
            type="button"
            className="text-sm text-muted underline underline-offset-4 hover:text-ink"
            onClick={async () => {
              await signOutAccount().catch(() => null);
              window.location.reload();
            }}
          >
            Sair desta conta
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-4xl gap-6 lg:grid-cols-2 lg:gap-8">
      <section aria-labelledby="entrar-titulo" className="border border-line bg-paper p-6 sm:p-8">
        <h1 id="entrar-titulo" className="text-[1.125rem] font-semibold uppercase tracking-[0.12em]">
          Já tem uma conta?
        </h1>
        {notice ? (
          <p className="mt-4 border border-rose-ink/20 bg-rose-soft px-4 py-3 text-sm" role="status">
            {NOTICES[notice]}
          </p>
        ) : null}
        <div className="mt-6">
          <LoginForm next={next} idPrefix="entrar" />
        </div>
      </section>
      <section aria-labelledby="nova-conta-titulo" className="flex flex-col border border-line bg-rose-soft p-6 sm:p-8">
        <h2 id="nova-conta-titulo" className="text-[1.125rem] font-semibold uppercase tracking-[0.12em]">
          Nova por aqui?
        </h2>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-soft">Crie sua conta MIVORA em poucos minutos. Ela é necessária para finalizar compras.</p>
        <ul className="mt-5 space-y-2.5 text-sm">
          {BENEFITS.map((b) => (
            <li key={b} className="flex gap-2.5">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-paper text-rose-ink">
                <Check className="h-3 w-3" strokeWidth={2.5} />
              </span>
              {b}
            </li>
          ))}
        </ul>
        <Link href={`/criar-conta?next=${encodeURIComponent(next)}`} className={buttonClasses("primary", "lg", "mt-8 w-full lg:mt-auto")}>
          Criar conta
        </Link>
      </section>
    </div>
  );
}

/** Small loader used while the account is checked */
export function AuthLoading() {
  return (
    <span className="flex items-center justify-center py-10" role="status">
      <Loader2 className="h-5 w-5 animate-spin text-muted" aria-label="Carregando" />
    </span>
  );
}
