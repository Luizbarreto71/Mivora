"use client";

import { Check, Copy, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Logo } from "@/components/brand/logo";
import { buttonClasses } from "@/components/ui/button";
import { lockBodyScroll } from "@/lib/scroll-lock";
import { markWelcomeSeen, saveCoupon, welcomeSeen } from "@/lib/store/welcome";
import { cn } from "@/lib/utils";
import { useStoreConfig } from "./store-config";

/**
 * Full-screen welcome shown once per device: animated brand reveal followed by
 * the first-purchase offer. Never rendered on the server, so it does not affect
 * SEO or the static shell; closes with Esc, the X, or the call to action.
 */
export function WelcomeIntro() {
  const { welcomeOffer } = useStoreConfig();
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!welcomeSeen()) setOpen(true);
  }, []);

  const close = useCallback(
    (keepCoupon: boolean) => {
      markWelcomeSeen();
      if (keepCoupon && welcomeOffer) saveCoupon(welcomeOffer.code);
      setLeaving(true);
      window.setTimeout(() => setOpen(false), 550);
    },
    [welcomeOffer],
  );

  // layout effect: the screen opens on its own, so its first frame must already have the final layout (no layout shift)
  useLayoutEffect(() => {
    if (!open) return;
    const unlock = lockBodyScroll();
    dialogRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close(true);
    document.addEventListener("keydown", onKey);
    return () => {
      unlock();
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  if (!open) return null;

  const copy = async () => {
    if (!welcomeOffer) return;
    try {
      await navigator.clipboard.writeText(welcomeOffer.code);
    } catch {
      /* clipboard blocked: the code stays visible */
    }
    saveCoupon(welcomeOffer.code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2200);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
      ref={dialogRef}
      tabIndex={-1}
      className={cn(
        "fixed inset-0 z-[90] flex items-center outline-none justify-center overflow-y-auto bg-[#FBF8F2] px-5 py-10 transition-[opacity,transform] duration-500 ease-[var(--ease-soft)]",
        leaving ? "pointer-events-none scale-[1.02] opacity-0" : "opacity-100",
      )}
    >
      {/* soft atmosphere */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-x-0 top-[calc(38%_-_35vmin)] mx-auto h-[70vmin] w-[70vmin] animate-intro-glow rounded-full bg-[radial-gradient(circle,rgba(234,221,221,0.75)_0%,rgba(251,248,242,0)_68%)]" />
      </div>

      <button
        type="button"
        onClick={() => close(true)}
        aria-label="Fechar apresentação"
        className="absolute right-4 top-4 flex h-11 w-11 animate-fade-in items-center justify-center rounded-full text-ink/60 [animation-delay:1.6s] hover:bg-ink/5 hover:text-ink"
      >
        <X className="h-5 w-5" strokeWidth={1.5} />
      </button>

      <div className="relative flex w-full max-w-lg flex-col items-center text-center">
        <span className="h-12 animate-intro-flame text-ink sm:h-14">
          <Logo variant="symbol" className="h-full" title="" />
        </span>
        <span className="mt-5 h-9 animate-intro-reveal text-ink [animation-delay:0.45s] sm:h-12">
          <Logo variant="wordmark" className="h-full" />
        </span>
        <span aria-hidden="true" className="mt-7 block h-px w-24 origin-center animate-intro-line bg-ink/25 [animation-delay:1.1s]" />

        <h2 id="welcome-title" className="heading-display mt-7 animate-fade-up text-[1.75rem] leading-tight [animation-delay:1.3s] sm:text-[2.125rem]">
          Bem-vinda à MIVORA
        </h2>
        <p className="mt-3 max-w-sm animate-fade-up text-[0.9375rem] leading-relaxed text-muted [animation-delay:1.45s]">
          Skincare coreano e beleza internacional, escolhidos com cuidado para o seu ritual.
        </p>

        {welcomeOffer ? (
          <div className="mt-9 w-full animate-fade-up rounded-panel border border-line bg-paper/80 px-6 py-7 shadow-[0_30px_60px_-40px_rgba(17,17,17,0.35)] backdrop-blur [animation-delay:1.65s] sm:px-10">
            <p className="eyebrow text-ink/70">Presente de boas-vindas</p>
            <p className="mt-3 text-[3rem] font-bold leading-none tracking-[-0.03em] sm:text-[3.5rem]">
              {welcomeOffer.percent}% <span className="text-[0.5em] tracking-[0.12em]">OFF</span>
            </p>
            <p className="mt-2 text-sm text-ink-soft">na sua primeira compra</p>
            <button
              type="button"
              onClick={copy}
              className="group mx-auto mt-6 flex h-12 items-center gap-3 rounded-control border border-dashed border-ink/40 px-5 transition hover:border-ink"
              aria-label={`Copiar cupom ${welcomeOffer.code}`}
            >
              <span className="text-sm font-semibold tracking-[0.28em]">{welcomeOffer.code}</span>
              <span className="flex items-center gap-1.5 border-l border-ink/15 pl-3 text-[0.6875rem] uppercase tracking-[0.14em] text-muted group-hover:text-ink">
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copiado" : "Copiar"}
              </span>
            </button>
            <p className="mt-4 text-xs leading-relaxed text-muted">
              Guardamos o cupom para você: ele já aparece aplicado quando você finalizar a compra. Válido para a primeira compra.
            </p>
          </div>
        ) : null}

        <div className="mt-8 flex w-full animate-fade-up flex-col items-center gap-3 [animation-delay:1.85s]">
          <button
            type="button"
            onClick={() => close(true)}
            className={buttonClasses("primary", "lg", "w-full max-w-xs")}
          >
            {welcomeOffer ? "Quero meu desconto" : "Começar a explorar"}
          </button>
          {welcomeOffer ? (
            <button type="button" onClick={() => close(false)} className="text-xs text-muted underline-offset-4 hover:text-ink hover:underline">
              Só quero conhecer a loja
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
