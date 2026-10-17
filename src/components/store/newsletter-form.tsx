"use client";

import { ArrowRight, Check, Loader2 } from "lucide-react";
import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { subscribeNewsletter, type NewsletterResult } from "@/lib/store/newsletter-actions";
import { cn } from "@/lib/utils";

export function NewsletterForm() {
  const inputId = useId();
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<NewsletterResult | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setResult(null);
    startTransition(async () => {
      const r = await subscribeNewsletter({ email, consent: true }).catch(() => ({ ok: false, message: "Não foi possível concluir a inscrição agora. Tente novamente." }));
      setResult(r);
      if (r.ok) setEmail("");
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="w-full max-w-md"
    >
      <label htmlFor={inputId} className="sr-only">
        Receba novidades e lançamentos
      </label>
      <div className="mt-3 flex border-b border-paper/30 focus-within:border-paper">
        <input
          id={inputId}
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          placeholder="Seu e-mail"
          className="h-11 min-w-0 flex-1 bg-transparent text-sm text-paper outline-none placeholder:text-paper/45"
        />
        <button type="submit" disabled={pending} className="flex h-11 w-11 items-center justify-center text-paper transition hover:translate-x-0.5 disabled:opacity-60" aria-label="Inscrever-se">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" strokeWidth={1.75} />}
        </button>
      </div>
      {result ? (
        <p role="status" className={cn("mt-2.5 flex items-start gap-1.5 text-xs", result.ok ? "text-paper" : "text-[#f0b4b4]")}>
          {result.ok ? <Check className="mt-px h-3.5 w-3.5 shrink-0" /> : null}
          {result.message}
        </p>
      ) : (
        <p className="mt-2.5 text-[0.6875rem] leading-relaxed text-paper/50">
          Ao se inscrever, você concorda em receber e-mails da MIVORA. Saiba mais na{" "}
          <Link href="/politica-de-privacidade" className="underline underline-offset-2 hover:text-paper">
            Política de Privacidade
          </Link>
          .
        </p>
      )}
    </form>
  );
}
