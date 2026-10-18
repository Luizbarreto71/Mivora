"use client";

import { ArrowRight, Check, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { buttonClasses } from "@/components/ui/button";
import { lockBodyScroll } from "@/lib/scroll-lock";
import { markPopupSession, popupDue, popupShownThisSession, quietPath, readPopupMemory, rememberPopup, welcomeShownThisSession } from "@/lib/skin/popup-schedule";
import { welcomeSeen } from "@/lib/store/welcome";
import type { Banner } from "@/lib/types";
import { SkinVisual } from "./skin-visual";

/** Opened once per page load at most: navigating inside the site never reopens it, a reload does (interval 0). */
let shownThisLoad = false;

/**
 * Launch pop-up of the skin analysis. Never during a purchase nor on the same load as the welcome intro.
 * Interval 0 (admin): opens on every load or reload of the site. 1–90 days: once per session, and again only that many
 * days after being closed. Closes with the X, Escape or a click outside; the buttons lead to the analysis or the home section.
 */
export function SkinLaunchPopup({ banner, intervalDays }: { banner: Banner; intervalDays: number }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (shownThisLoad || quietPath(pathname) || !welcomeSeen()) return;
    if (intervalDays > 0 && (welcomeShownThisSession() || popupShownThisSession() || !popupDue(readPopupMemory(), Date.now(), intervalDays))) return;
    // a short pause lets the page settle before the campaign appears
    const timer = window.setTimeout(() => {
      shownThisLoad = true;
      markPopupSession();
      returnFocus.current = document.activeElement as HTMLElement | null;
      setOpen(true);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [pathname, intervalDays]);

  const close = useCallback(
    (kind: "dismissed" | "started" = "dismissed") => {
      rememberPopup(kind, intervalDays);
      setOpen(false);
      returnFocus.current?.focus?.({ preventScroll: true });
    },
    [intervalDays],
  );

  // layout effect: the pop-up opens on its own, so its first frame must already have the final layout (no layout shift)
  useLayoutEffect(() => {
    if (!open) return;
    const unlock = lockBodyScroll();
    dialogRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      // keep keyboard focus inside the dialog
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      unlock();
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/45 p-4 backdrop-blur-[2px] motion-safe:animate-fade-in sm:items-center sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="skin-popup-title"
        aria-describedby="skin-popup-text"
        className="relative grid max-h-[calc(100dvh-2rem)] w-full max-w-[26rem] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-[6px] bg-paper shadow-[0_40px_80px_-30px_rgba(0,0,0,0.45)] motion-safe:animate-fade-up sm:max-w-[54rem] sm:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] sm:grid-rows-1"
      >
        <button
          type="button"
          onClick={() => close()}
          aria-label="Fechar"
          data-autofocus
          className="absolute right-3 top-3 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-paper/90 text-ink shadow-sm transition hover:bg-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <X className="h-5 w-5" strokeWidth={1.75} />
        </button>

        <SkinVisual banner={banner} sizes="(min-width: 640px) 26rem, 100vw" className="order-first h-40 sm:order-last sm:h-auto sm:min-h-[30rem]" />

        <div className="overflow-y-auto px-6 pb-6 pt-6 sm:px-10 sm:py-11">
          {banner.eyebrow ? (
            <p className="inline-flex rounded-full bg-rose px-3 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.2em] text-rose-ink">{banner.eyebrow}</p>
          ) : null}
          <h2 id="skin-popup-title" className="heading-display mt-4 text-[1.75rem] leading-[1.1] sm:text-[2.375rem]">
            {banner.title}
          </h2>
          {banner.subtitle ? (
            <p id="skin-popup-text" className="mt-3 text-[0.9375rem] leading-relaxed text-ink/75">
              {banner.subtitle}
            </p>
          ) : null}
          {banner.highlights?.length ? (
            <ul className="mt-5 space-y-2 text-sm text-ink">
              {banner.highlights.map((h) => (
                <li key={h} className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose text-rose-ink">
                    <Check className="h-3 w-3" strokeWidth={2.5} />
                  </span>
                  {h}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-7 grid gap-2.5">
            {banner.cta_label && banner.cta_href ? (
              <Link href={banner.cta_href} onClick={() => close("started")} className={buttonClasses("primary", "lg", "group/cta w-full gap-3 whitespace-normal px-5 text-center")}>
                {banner.cta_label} <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover/cta:translate-x-0.5" strokeWidth={1.75} />
              </Link>
            ) : null}
            {banner.cta2_label && banner.cta2_href ? (
              <Link href={banner.cta2_href} onClick={() => close()} className={buttonClasses("ghost", "md", "w-full whitespace-normal text-center normal-case tracking-normal underline underline-offset-4")}>
                {banner.cta2_label}
              </Link>
            ) : null}
          </div>
          <p className="mt-4 text-center text-[0.6875rem] leading-relaxed text-muted">Análise cosmética e informativa, não substitui a avaliação de um dermatologista.</p>
        </div>
      </div>
    </div>
  );
}
