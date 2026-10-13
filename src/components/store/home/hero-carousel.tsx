"use client";

import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { buttonClasses } from "@/components/ui/button";
import type { Banner } from "@/lib/types";
import { cn } from "@/lib/utils";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
// aligned with the page container, but always clear of the left arrow
const TEXT_INSET = "lg:pl-[max(6rem,calc((100vw-88rem)/2+2.5rem))]";

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(REDUCED_MOTION);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
}

/**
 * Home hero carousel: copy beside the photo (never on top of it), crossfade between
 * slides, autoplay that pauses on hover, focus, off-screen, on request and for
 * reduced motion. Slides without a campaign photo show `stage` (real product photos).
 */
export function HeroCarousel({ slides, stage }: { slides: Banner[]; stage: ReactNode }) {
  const count = slides.length;
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [hold, setHold] = useState(false);
  const [visible, setVisible] = useState(true);
  const reduced = usePrefersReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const touchX = useRef<number | null>(null);

  const multiple = count > 1;
  const autoplay = multiple && playing && !hold && visible && !reduced;
  const go = (step: number) => setIndex((i) => (i + step + count) % count);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el || !multiple) return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, [multiple]);

  return (
    <section
      ref={sectionRef}
      className="relative overflow-hidden border-b border-line"
      aria-roledescription={multiple ? "carrossel" : undefined}
      aria-label={multiple ? "Destaques da MIVORA" : undefined}
      onPointerEnter={(e) => e.pointerType === "mouse" && setHold(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setHold(false)}
      onFocus={() => setHold(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHold(false);
      }}
      onKeyDown={(e) => {
        if (!multiple) return;
        if (e.key === "ArrowLeft") go(-1);
        if (e.key === "ArrowRight") go(1);
      }}
      onTouchStart={(e) => {
        touchX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const start = touchX.current;
        touchX.current = null;
        if (start == null || !multiple) return;
        const dx = (e.changedTouches[0]?.clientX ?? start) - start;
        if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
      }}
    >
      <div className="grid" aria-live={autoplay ? "off" : "polite"}>
        {slides.map((s, i) => {
          const active = i === index;
          const Heading = i === 0 ? "h1" : "h2";
          // copy rises in, one line after the other, when its slide becomes active
          const reveal = cn("transition duration-700 ease-out motion-reduce:transition-none", active ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0");
          const delay = (step: number) => ({ transitionDelay: active ? `${120 + step * 90}ms` : "0ms" });
          return (
            <div
              key={s.id}
              role={multiple ? "group" : undefined}
              aria-roledescription={multiple ? "slide" : undefined}
              aria-label={multiple ? `${i + 1} de ${count}` : undefined}
              aria-hidden={active ? undefined : true}
              inert={!active}
              className={cn(
                "col-start-1 row-start-1 flex flex-col transition-opacity duration-700 ease-out motion-reduce:transition-none lg:grid lg:min-h-[min(46rem,calc(100dvh-8rem))] lg:grid-cols-[minmax(0,1fr)_minmax(0,min(52vw,52rem))]",
                active ? "z-10 opacity-100" : "pointer-events-none opacity-0",
              )}
            >
              <div className="order-2 flex flex-1 items-center bg-paper lg:order-1">
                <div className={cn("w-full px-4 pt-10 sm:px-10 sm:pt-14 lg:py-20 lg:pr-16", multiple ? "pb-20 lg:pb-24" : "pb-14 sm:pb-20", TEXT_INSET)}>
                  {s.eyebrow ? (
                    <p className={cn("eyebrow mb-5", reveal)} style={delay(0)}>
                      {s.eyebrow}
                    </p>
                  ) : null}
                  <Heading className={cn("heading-display max-w-[17ch] text-balance text-[2.125rem] leading-[1.08] sm:text-[2.75rem] xl:text-[3.25rem]", reveal)} style={delay(1)}>
                    {s.title}
                  </Heading>
                  {s.subtitle ? (
                    <p className={cn("mt-6 max-w-md text-base leading-relaxed text-muted sm:text-lg", reveal)} style={delay(2)}>
                      {s.subtitle}
                    </p>
                  ) : null}
                  {(s.cta_label && s.cta_href) || (s.cta2_label && s.cta2_href) ? (
                    <div className={cn("mt-9 flex flex-col gap-3 sm:flex-row", reveal)} style={delay(3)}>
                      {s.cta_label && s.cta_href ? (
                        <Link href={s.cta_href} className={buttonClasses("primary", "lg", "sm:min-w-52")}>
                          {s.cta_label}
                        </Link>
                      ) : null}
                      {s.cta2_label && s.cta2_href ? (
                        <Link href={s.cta2_href} className={buttonClasses("outline", "lg", "sm:min-w-52")}>
                          {s.cta2_label}
                        </Link>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="relative order-1 aspect-square overflow-hidden bg-ivory sm:aspect-[4/3] lg:order-2 lg:aspect-auto">
                {s.image_desktop_url ? (
                  <div
                    className={cn(
                      "absolute inset-0 transition-transform duration-[7000ms] ease-out motion-reduce:transition-none",
                      active ? "scale-100" : "scale-[1.04]",
                    )}
                  >
                    {s.image_mobile_url ? (
                      <>
                        <Image src={s.image_mobile_url} alt={s.image_alt ?? ""} fill preload={i === 0} sizes="100vw" className="object-cover lg:hidden" />
                        <Image src={s.image_desktop_url} alt={s.image_alt ?? ""} fill preload={i === 0} sizes="52vw" className="hidden object-cover lg:block" />
                      </>
                    ) : (
                      <Image src={s.image_desktop_url} alt={s.image_alt ?? ""} fill preload={i === 0} sizes="(min-width: 1024px) 52vw, 100vw" className="object-cover" />
                    )}
                  </div>
                ) : (
                  stage
                )}
              </div>
            </div>
          );
        })}
      </div>

      {multiple ? (
        <>
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Destaque anterior"
            className="absolute left-3 top-[50vw] z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-paper/95 text-ink shadow-[0_2px_14px_rgba(0,0,0,0.12)] transition hover:bg-paper sm:top-[37.5vw] lg:left-5 lg:top-1/2 lg:h-11 lg:w-11"
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Próximo destaque"
            className="absolute right-3 top-[50vw] z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-paper/95 text-ink shadow-[0_2px_14px_rgba(0,0,0,0.12)] transition hover:bg-paper sm:top-[37.5vw] lg:right-5 lg:top-1/2 lg:h-11 lg:w-11"
          >
            <ChevronRight className="h-5 w-5" strokeWidth={1.5} />
          </button>

          <div className={cn("absolute bottom-0 left-0 z-20 flex items-center gap-4 px-4 pb-6 sm:px-10 lg:pb-10", TEXT_INSET)}>
            <div className="flex items-center gap-1.5">
              {slides.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-label={`Ir para o destaque ${i + 1}: ${s.title}`}
                  aria-current={i === index ? "true" : undefined}
                  className="group flex h-8 items-center px-0.5"
                >
                  <span className={cn("relative block h-[2px] overflow-hidden rounded-full transition-all duration-500", i === index ? "w-12 bg-ink/15" : "w-6 bg-ink/20 group-hover:bg-ink/45")}>
                    {i === index ? (
                      <span
                        key={index}
                        className="absolute inset-0 origin-left animate-hero-progress bg-ink motion-reduce:animate-none motion-reduce:bg-ink"
                        style={{ animationPlayState: autoplay ? "running" : "paused" }}
                        onAnimationEnd={() => go(1)}
                      />
                    ) : null}
                  </span>
                </button>
              ))}
            </div>
            {!reduced ? (
              <button
                type="button"
                onClick={() => setPlaying((p) => !p)}
                aria-label={playing ? "Pausar a troca automática" : "Retomar a troca automática"}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-ink/70 transition hover:border-ink hover:text-ink"
              >
                {playing ? <Pause className="h-3.5 w-3.5" strokeWidth={1.75} /> : <Play className="h-3.5 w-3.5" strokeWidth={1.75} />}
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
