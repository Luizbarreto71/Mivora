"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, buttonClasses } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { signInWithEmail } from "@/lib/auth/actions";
import { useStoreConfig } from "../store-config";
import { PasswordInput } from "./password-input";
import { SocialSignIn } from "./social-sign-in";

/**
 * "JÁ TEM UMA CONTA?" — real sign-in with Supabase Auth (the server checks the password and creates the session).
 * Used in the header pop-over, on /entrar and in the checkout. Unconfirmed e-mails go to the confirmation screen.
 */
export function LoginForm({ next, idPrefix = "login", onSignedIn }: { next: string; idPrefix?: string; onSignedIn?: () => void }) {
  const router = useRouter();
  const { socialProviders } = useStoreConfig();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const signupHref = `/criar-conta?next=${encodeURIComponent(next)}`;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) local.email = "Digite um e-mail válido, ex.: nome@exemplo.com.br.";
    if (!password) local.password = "Digite sua senha.";
    setErrors(local);
    setFormError(null);
    if (Object.keys(local).length) return;
    setBusy(true);
    const result = await signInWithEmail({ email, password, next }).catch(() => ({ ok: false as const, error: "Não foi possível entrar agora. Tente de novo em instantes." }));
    if (result.ok) {
      onSignedIn?.();
      // a full navigation makes every part of the page read the new session
      window.location.assign(result.next);
      return;
    }
    setBusy(false);
    if ("unconfirmed" in result && result.unconfirmed) {
      router.push(`/confirmar-email?email=${encodeURIComponent(result.email ?? email)}&next=${encodeURIComponent(next)}`);
      return;
    }
    if ("fields" in result && result.fields) setErrors(result.fields);
    setFormError(result.error);
  };

  return (
    <div className="space-y-5">
      <form onSubmit={submit} noValidate className="space-y-4" aria-label="Entrar na sua conta">
        <Field label="E-mail" htmlFor={`${idPrefix}-email`} error={errors.email}>
          <Input
            id={`${idPrefix}-email`}
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={errors.email ? true : undefined}
            placeholder="nome@exemplo.com.br"
          />
        </Field>
        <Field label="Senha" htmlFor={`${idPrefix}-password`} error={errors.password}>
          <PasswordInput id={`${idPrefix}-password`} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={errors.password ? true : undefined} />
        </Field>
        {formError ? (
          <p className="border border-danger/30 bg-danger/5 px-3.5 py-2.5 text-sm text-danger" role="alert">
            {formError}
          </p>
        ) : null}
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {busy ? "Entrando…" : "Entrar"}
        </Button>
      </form>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link href={signupHref} className={buttonClasses("outline", "md", "flex-1")}>
          Criar conta
        </Link>
        <Link href="/esqueci-senha" className="text-[0.8125rem] text-muted underline underline-offset-4 hover:text-ink">
          Esqueceu sua senha?
        </Link>
      </div>
      {socialProviders.google || socialProviders.apple ? (
        <>
          <div className="flex items-center gap-3 text-xs text-muted" role="separator">
            <span className="h-px flex-1 bg-line" />
            ou entre com
            <span className="h-px flex-1 bg-line" />
          </div>
          <SocialSignIn providers={socialProviders} next={next} />
        </>
      ) : null}
    </div>
  );
}
