"use client";

import { LogOut, Package, User, UserRound, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getSessionSummary, type SessionSummary } from "@/lib/auth/actions";
import { signOutAccount } from "@/lib/store/account-actions";
import { cn } from "@/lib/utils";
import { LoginForm } from "./login-form";

/** Window event sent when the session changes without a page load (sign-out or expired session in the checkout). */
export const SESSION_CHANGED = "mivora:session";

/**
 * Header account button: a sign-in pop-over (full screen on phones) or, when signed in, the account shortcuts.
 * The panel is rendered in <body>: the header's backdrop blur would otherwise trap a fixed panel inside the header.
 */
export function AccountMenu({ buttonClassName }: { buttonClassName: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<SessionSummary | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ top: 72, right: 16 });
  const [busy, setBusy] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      getSessionSummary()
        .catch(() => null)
        .then((s) => !cancelled && setSession(s));
    load();
    // the checkout signs out (or finds the session expired) without reloading the page
    window.addEventListener(SESSION_CHANGED, load);
    return () => {
      cancelled = true;
      window.removeEventListener(SESSION_CHANGED, load);
    };
  }, []);

  const place = useCallback(() => {
    const r = button.current?.getBoundingClientRect();
    if (r) setAnchor({ top: Math.round(r.bottom + 8), right: Math.max(8, Math.round(window.innerWidth - r.right)) });
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    button.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!open) return;
    panel.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!panel.current?.contains(target) && !button.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("resize", place);
    };
  }, [open, close, place]);

  // the pages themselves already offer the sign-in: avoid a second form on top of them
  const next = pathname && !["/entrar", "/criar-conta", "/confirmar-email", "/esqueci-senha", "/redefinir-senha"].includes(pathname) ? pathname : "/minha-conta";

  return (
    <div className="relative">
      <button
        ref={button}
        type="button"
        onClick={() => {
          if (!open) place();
          setOpen((o) => !o);
        }}
        className={buttonClassName}
        aria-label={session ? `Minha conta (${session.firstName ?? session.email})` : "Minha conta"}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <User className="h-5 w-5" strokeWidth={1.5} />
        {session ? <span className="absolute right-2 top-2 h-2 w-2 rounded-full border border-paper bg-rose-ink" aria-hidden="true" /> : null}
      </button>
      {open
        ? createPortal(
            <div
              ref={panel}
              role="dialog"
              aria-modal="false"
              aria-label={session ? "Minha conta" : "Entrar na sua conta"}
              tabIndex={-1}
              style={{ "--menu-top": `${anchor.top}px`, "--menu-right": `${anchor.right}px` } as React.CSSProperties}
              className="fixed inset-0 z-50 overflow-y-auto bg-paper px-5 pb-8 pt-5 outline-none sm:inset-auto sm:right-[var(--menu-right)] sm:top-[var(--menu-top)] sm:max-h-[calc(100dvh_-_var(--menu-top)_-_1rem)] sm:w-[23rem] sm:border sm:border-line sm:p-6 sm:shadow-[0_24px_48px_-24px_rgba(0,0,0,0.25)]"
            >
              <div className="mb-5 flex items-center justify-between gap-3">
                <p className="text-[0.9375rem] font-semibold uppercase tracking-[0.12em]">{session ? `Olá${session.firstName ? `, ${session.firstName}` : ""}` : "Já tem uma conta?"}</p>
                <button type="button" onClick={close} aria-label="Fechar" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-ivory">
                  <X className="h-4 w-4" />
                </button>
              </div>
              {session === undefined ? (
                <div className="h-40 animate-pulse bg-ivory" aria-busy="true" />
              ) : session ? (
                <div className="space-y-1 text-sm">
                  <p className="mb-3 break-all text-muted">{session.email}</p>
                  <Link href="/minha-conta" onClick={() => setOpen(false)} className="flex min-h-11 items-center gap-3 border-t border-line">
                    <UserRound className="h-4 w-4" strokeWidth={1.5} /> Minha conta
                  </Link>
                  <Link href="/minha-conta#pedidos" onClick={() => setOpen(false)} className="flex min-h-11 items-center gap-3 border-t border-line">
                    <Package className="h-4 w-4" strokeWidth={1.5} /> Meus pedidos
                  </Link>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      await signOutAccount().catch(() => null);
                      setSession(null);
                      setBusy(false);
                      setOpen(false);
                      router.push("/");
                      router.refresh();
                    }}
                    className={cn("flex min-h-11 w-full items-center gap-3 border-t border-line text-left", busy && "opacity-60")}
                  >
                    <LogOut className="h-4 w-4" strokeWidth={1.5} /> Sair
                  </button>
                </div>
              ) : (
                <LoginForm next={next} idPrefix="menu" />
              )}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
