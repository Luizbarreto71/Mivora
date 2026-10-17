"use client";

import { Loader2, MailCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { resendConfirmation } from "@/lib/auth/actions";
import { isValidEmail } from "@/lib/store/checkout-data";

/**
 * "CONFIRME SEU E-MAIL": shown after sign-up, when an unconfirmed account tries to sign in or buy, and when a
 * confirmation link expired. "Reenviar e-mail" asks Supabase Auth for a new link (with its waiting time).
 */
export function ConfirmEmail({ email: initialEmail, next, justSent = false, invalidLink = false }: { email: string; next: string; justSent?: boolean; invalidLink?: boolean }) {
  const [email, setEmail] = useState(initialEmail);
  const [cooldown, setCooldown] = useState(justSent ? 60 : 0);
  const [state, setState] = useState<{ busy: boolean; message: string | null; tone: "ok" | "error" }>({ busy: false, message: null, tone: "ok" });
  const [emailError, setEmailError] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  const resend = async () => {
    if (!isValidEmail(email)) {
      setEmailError("Digite um e-mail válido, ex.: nome@exemplo.com.br.");
      return;
    }
    setEmailError(null);
    setState({ busy: true, message: null, tone: "ok" });
    const r = await resendConfirmation({ email, next }).catch(() => ({ ok: false as const, error: "Não foi possível reenviar agora. Tente de novo em instantes." }));
    if (r.ok) {
      setState({ busy: false, tone: "ok", message: `Se houver um cadastro aguardando confirmação para ${email}, um novo link foi enviado.` });
      setCooldown(60);
    } else {
      setState({ busy: false, tone: "error", message: r.error });
      if ("retryAfter" in r && r.retryAfter) setCooldown(r.retryAfter);
    }
  };

  return (
    <div className="mx-auto max-w-lg text-center">
      <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose text-rose-ink">
        <MailCheck className="h-7 w-7" strokeWidth={1.5} />
      </span>
      <h1 className="heading-display mt-6 text-[1.75rem] uppercase tracking-[0.04em] sm:text-[2rem]">{invalidLink ? "Link expirado ou inválido" : "Confirme seu e-mail"}</h1>
      {invalidLink ? (
        <p className="mt-4 text-[0.9375rem] leading-relaxed text-ink-soft">
          Este link de confirmação expirou ou já foi usado. Peça um novo abaixo: ele chega em instantes no seu e-mail.
        </p>
      ) : (
        <p className="mt-4 text-[0.9375rem] leading-relaxed text-ink-soft">
          Estamos quase lá! Enviamos um link de confirmação para o seu e-mail. Confirme seu endereço para ativar sua conta e continuar sua experiência na MIVORA.
        </p>
      )}
      {initialEmail ? (
        <p className="mt-4 break-all text-sm">
          E-mail informado: <strong className="font-semibold">{initialEmail}</strong>
        </p>
      ) : (
        <div className="mx-auto mt-5 max-w-sm text-left">
          <Field label="E-mail" htmlFor="ce-email" error={emailError}>
            <Input id="ce-email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={emailError ? true : undefined} />
          </Field>
        </div>
      )}

      <div className="mx-auto mt-7 max-w-sm space-y-3">
        <Button size="lg" className="w-full" onClick={resend} disabled={state.busy || cooldown > 0}>
          {state.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {cooldown > 0 ? `Reenviar e-mail (${cooldown}s)` : "Reenviar e-mail"}
        </Button>
        {state.message ? (
          <p className={state.tone === "ok" ? "text-sm text-success" : "text-sm text-danger"} role={state.tone === "ok" ? "status" : "alert"}>
            {state.message}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 pt-2 text-xs font-semibold uppercase tracking-[0.14em]">
          <Link href={`/criar-conta?email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`} className="underline underline-offset-4">
            Alterar e-mail
          </Link>
          <Link href={`/entrar?next=${encodeURIComponent(next)}`} className="underline underline-offset-4">
            Voltar para o login
          </Link>
        </div>
      </div>
      <p className="mt-8 text-xs leading-relaxed text-muted">Não encontrou? Confira a caixa de spam ou de promoções. O link vale por tempo limitado; depois da confirmação, você volta direto para onde parou.</p>
    </div>
  );
}
