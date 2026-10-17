"use client";

import { KeyRound, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button, buttonClasses } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { requestPasswordReset, resetPassword } from "@/lib/auth/actions";
import { passwordOk } from "@/lib/auth/password";
import { isValidEmail } from "@/lib/store/checkout-data";
import { PasswordInput, PasswordRules } from "./password-input";

/** "ESQUECEU SUA SENHA?": asks Supabase Auth for a recovery link; the answer never says whether the e-mail has an account. */
export function ForgotPassword({ invalidLink = false }: { invalidLink?: boolean }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidEmail(email)) {
      setError("Digite um e-mail válido, ex.: nome@exemplo.com.br.");
      return;
    }
    setError(null);
    setBusy(true);
    const r = await requestPasswordReset({ email }).catch(() => ({ ok: false as const, error: "Não foi possível enviar agora. Tente de novo em instantes." }));
    setBusy(false);
    if (r.ok) setSent(true);
    else setError(r.error);
  };

  return (
    <div className="mx-auto max-w-md">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-rose text-rose-ink">
        <KeyRound className="h-6 w-6" strokeWidth={1.5} />
      </span>
      <h1 className="heading-display mt-6 text-[1.75rem] uppercase tracking-[0.04em] sm:text-[2rem]">Esqueceu sua senha?</h1>
      {invalidLink ? (
        <p className="mt-4 border border-line bg-ivory px-4 py-3 text-sm text-ink-soft" role="status">
          O link de recuperação expirou ou já foi usado. Peça um novo abaixo.
        </p>
      ) : null}
      {sent ? (
        <div className="mt-5 space-y-4" role="status">
          <p className="text-[0.9375rem] leading-relaxed text-ink-soft">
            Se houver uma conta com <strong className="break-all font-semibold text-ink">{email}</strong>, você vai receber um e-mail com um link para criar uma nova senha. O link vale por tempo limitado.
          </p>
          <p className="text-xs text-muted">Não encontrou? Confira a caixa de spam ou de promoções.</p>
          <Link href="/entrar" className={buttonClasses("outline", "md")}>
            Voltar para o login
          </Link>
        </div>
      ) : (
        <>
          <p className="mt-4 text-[0.9375rem] leading-relaxed text-ink-soft">Informe seu e-mail e enviaremos as instruções para você recuperar o acesso à sua conta.</p>
          <form onSubmit={submit} noValidate className="mt-6 space-y-4" aria-label="Recuperar senha">
            <Field label="E-mail" htmlFor="fp-email" error={error}>
              <Input id="fp-email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={error ? true : undefined} placeholder="nome@exemplo.com.br" />
            </Field>
            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Enviar link de recuperação
            </Button>
          </form>
          <Link href="/entrar" className="mt-5 inline-block text-sm text-muted underline underline-offset-4 hover:text-ink">
            Voltar para o login
          </Link>
        </>
      )}
    </div>
  );
}

/** New password after the recovery link (the link opened a short session for the account). */
export function ResetPassword({ hasSession }: { hasSession: boolean }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [expired, setExpired] = useState(!hasSession);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!passwordOk(password)) local.password = "A senha não cumpre todos os requisitos.";
    if (confirm !== password) local.confirm = "As senhas não são iguais.";
    setErrors(local);
    setFormError(null);
    if (Object.keys(local).length) return;
    setBusy(true);
    const r = await resetPassword({ password, confirm }).catch(() => ({ ok: false as const, error: "Não foi possível salvar agora. Tente de novo em instantes." }));
    setBusy(false);
    if (r.ok) {
      setDone(true);
      return;
    }
    if ("expired" in r && r.expired) setExpired(true);
    if ("fields" in r && r.fields) setErrors(r.fields);
    setFormError(r.error);
  };

  return (
    <div className="mx-auto max-w-md">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-rose text-rose-ink">
        <KeyRound className="h-6 w-6" strokeWidth={1.5} />
      </span>
      <h1 className="heading-display mt-6 text-[1.75rem] uppercase tracking-[0.04em] sm:text-[2rem]">Crie uma nova senha</h1>
      {done ? (
        <div className="mt-5 space-y-4" role="status">
          <p className="text-[0.9375rem] text-success">Senha alterada com sucesso. Você já está conectada à sua conta.</p>
          <Link href="/minha-conta" className={buttonClasses("primary", "md")}>
            Ir para minha conta
          </Link>
        </div>
      ) : expired ? (
        <div className="mt-5 space-y-4">
          <p className="text-[0.9375rem] leading-relaxed text-ink-soft" role="alert">
            {formError ?? "Este link de redefinição expirou ou já foi usado. Peça um novo para criar sua senha."}
          </p>
          <Link href="/esqueci-senha" className={buttonClasses("primary", "md")}>
            Pedir um novo link
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="mt-6 space-y-4" aria-label="Nova senha">
          <Field label="Nova senha" htmlFor="rp-password" error={errors.password}>
            <PasswordInput id="rp-password" autoComplete="new-password" maxLength={72} value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={errors.password ? true : undefined} />
          </Field>
          <Field label="Confirmar nova senha" htmlFor="rp-confirm" error={errors.confirm}>
            <PasswordInput id="rp-confirm" autoComplete="new-password" maxLength={72} value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={errors.confirm ? true : undefined} />
          </Field>
          <PasswordRules password={password} />
          {formError ? (
            <p className="border border-danger/30 bg-danger/5 px-3.5 py-2.5 text-sm text-danger" role="alert">
              {formError}
            </p>
          ) : null}
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Salvar nova senha
          </Button>
        </form>
      )}
    </div>
  );
}
