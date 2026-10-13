"use client";

import { ArrowLeft, ArrowRight, Pause, Play } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { buttonClasses } from "@/components/ui/button";
import type { Banner } from "@/lib/types";
import { cn } from "@/lib/utils";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const DEFAULT_BG = "#F6E4E1";

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
 * Home banner (mockup): wide rosé banner, copy on the left, photo or product on the right.
 * Crossfade between slides; autoplay pauses on hover, focus, off-screen, on request and for
 * reduced motion. Campaign photos dissolve into the slide colour; slides without a photo show
 * the chosen product under a soft studio light.
 */
export function HeroCarousel({ slides }: { slides: Banner[] }) {
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

  const controls = {
    slides,
    index,
    autoplay,
    onSelect: setIndex,
    onEnd: () => go(1),
  };

  return (
    <section
      ref={sectionRef}
      className="relative overflow-hidden"
      style={{ "--hero-h": "clamp(30rem, 37vw, 38rem)" } as CSSProperties}
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
                "relative col-start-1 row-start-1 flex flex-col transition-opacity duration-700 ease-out motion-reduce:transition-none lg:block lg:h-[var(--hero-h)]",
                active ? "z-10 opacity-100" : "pointer-events-none opacity-0",
              )}
              style={{ backgroundColor: s.background_color ?? DEFAULT_BG }}
            >
              <div className="container-page relative z-10 flex items-center pb-8 pt-10 sm:pt-14 lg:h-full lg:py-0">
                <div className="max-w-[36rem] lg:pb-12">
                  {s.eyebrow ? (
                    <p className={cn("mb-4 text-[0.6875rem] font-medium uppercase tracking-[0.22em] text-ink/70", reveal)} style={delay(0)}>
                      {s.eyebrow}
                    </p>
                  ) : null}
                  <Heading className={cn("heading-display text-balance text-[2.25rem] leading-[1.06] sm:text-[2.75rem] lg:text-[3.25rem] xl:text-[3.5rem]", reveal)} style={delay(1)}>
                    {s.title}
                  </Heading>
                  {s.subtitle ? (
                    <p className={cn("mt-4 max-w-[27rem] text-[0.9375rem] leading-relaxed text-ink/75 sm:text-base", reveal)} style={delay(2)}>
                      {s.subtitle}
                    </p>
                  ) : null}
                  {(s.cta_label && s.cta_href) || (s.cta2_label && s.cta2_href) ? (
                    <div className={cn("mt-7 flex flex-col gap-3 sm:flex-row", reveal)} style={delay(3)}>
                      {s.cta_label && s.cta_href ? (
                        <Link href={s.cta_href} className={buttonClasses("primary", "md", "group/cta h-12 gap-3 px-7")}>
                          {s.cta_label} <ArrowRight className="h-4 w-4 transition-transform group-hover/cta:translate-x-0.5" strokeWidth={1.75} />
                        </Link>
                      ) : null}
                      {s.cta2_label && s.cta2_href ? (
                        <Link href={s.cta2_href} className={buttonClasses("outline", "md", "h-12 px-7")}>
                          {s.cta2_label}
                        </Link>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
              <SlideVisual slide={s} active={active} preload={i === 0} />
            </div>
          );
        })}
      </div>

      {multiple ? (
        <>
          {/* desktop: under the copy, as in the mockup */}
          <div className="pointer-events-none absolute inset-x-0 bottom-8 z-20 hidden lg:block">
            <div className="container-page">
              <div className="pointer-events-auto flex w-fit items-center gap-5">
                <Indicators {...controls} />
                <Arrows onPrev={() => go(-1)} onNext={() => go(1)} />
                {!reduced ? <PauseButton playing={playing} onToggle={() => setPlaying((p) => !p)} /> : null}
              </div>
            </div>
          </div>
          {/* mobile: a slim bar below the banner */}
          <div className="flex items-center justify-between gap-4 border-b border-line bg-paper px-4 py-2 sm:px-6 lg:hidden">
            <Indicators {...controls} compact />
            <div className="flex items-center gap-1">
              {!reduced ? <PauseButton playing={playing} onToggle={() => setPlaying((p) => !p)} /> : null}
              <Arrows onPrev={() => go(-1)} onNext={() => go(1)} />
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}

function SlideVisual({ slide: s, active, preload }: { slide: Banner; active: boolean; preload: boolean }) {
  const motion = cn("transition-transform duration-[7000ms] ease-out motion-reduce:transition-none", active ? "scale-100" : "scale-[1.04]");
  if (s.image_desktop_url) {
    return (
      <div className="relative aspect-square w-full overflow-hidden sm:aspect-[16/11] lg:absolute lg:inset-y-0 lg:right-0 lg:aspect-auto lg:w-[min(56%,calc(var(--hero-h)*1.18))] lg:[mask-image:linear-gradient(to_right,transparent,#000_34%)]">
        <div className={cn("absolute inset-0", motion)}>
          {s.image_mobile_url ? (
            <>
              <Image src={s.image_mobile_url} alt={s.image_alt ?? ""} fill preload={preload} sizes="100vw" className="object-cover lg:hidden" />
              <Image src={s.image_desktop_url} alt={s.image_alt ?? ""} fill preload={preload} sizes="40vw" className="hidden object-cover lg:block" />
            </>
          ) : (
            <Image src={s.image_desktop_url} alt={s.image_alt ?? ""} fill preload={preload} sizes="(min-width: 1024px) 40vw, 100vw" className="object-cover" />
          )}
        </div>
      </div>
    );
  }
  const image = s.product?.image;
  if (!image) return null;
  return (
    <div className="relative aspect-[5/4] w-full overflow-hidden lg:absolute lg:inset-y-0 lg:right-0 lg:aspect-auto lg:w-[52%]">
      {/* studio light: the product photo (white background) blends into it */}
      <div
        aria-hidden="true"
        className="absolute left-1/2 top-1/2 aspect-square h-[125%] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: "radial-gradient(closest-side, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0.88) 42%, rgba(255,255,255,0.35) 68%, rgba(255,255,255,0) 100%)" }}
      />
      <div aria-hidden="true" className="absolute bottom-[7%] left-1/2 h-[6%] w-[34%] -translate-x-1/2 rounded-[50%] bg-ink/10 blur-xl" />
      {/* multiply on the animated wrapper (a transform would isolate a blend set on the image) */}
      <div className={cn("absolute inset-0 mix-blend-multiply", motion)}>
        <Image
          src={image.url}
          alt={image.alt ?? s.product?.name ?? ""}
          fill
          preload={preload}
          sizes="(min-width: 1024px) 45vw, 100vw"
          className="object-contain px-[10%] py-[5%] lg:py-[4%]"
        />
      </div>
    </div>
  );
}

function Indicators({
  slides,
  index,
  autoplay,
  onSelect,
  onEnd,
  compact = false,
}: {
  slides: Banner[];
  index: number;
  autoplay: boolean;
  onSelect: (i: number) => void;
  onEnd: () => void;
  compact?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      {slides.map((s, i) => {
        const active = i === index;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelect(i)}
            aria-label={`Ir para o destaque ${i + 1}: ${s.title}`}
            aria-current={active ? "true" : undefined}
            className="group flex h-8 items-center gap-3 text-[0.6875rem] font-semibold tabular-nums tracking-[0.08em]"
          >
            <span className={cn("transition-colors", active ? "text-ink" : "text-ink/40 group-hover:text-ink/70")}>{String(i + 1).padStart(2, "0")}</span>
            {active ? (
              <span className={cn("relative block h-px overflow-hidden bg-ink/15", compact ? "w-8" : "w-12")}>
                {/* the bar's end advances to the next slide */}
                <span
                  key={index}
                  className="absolute inset-0 origin-left animate-hero-progress bg-ink motion-reduce:animate-none"
                  style={{ animationPlayState: autoplay ? "running" : "paused" }}
                  onAnimationEnd={onEnd}
                />
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function Arrows({ onPrev, onNext }: { onPrev: () => void; onNext: () => void }) {
  const cls = "flex h-9 w-9 items-center justify-center rounded-full text-ink/80 transition hover:bg-ink/5 hover:text-ink";
  return (
    <div className="flex items-center">
      <button type="button" onClick={onPrev} aria-label="Destaque anterior" className={cls}>
        <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
      </button>
      <button type="button" onClick={onNext} aria-label="Próximo destaque" className={cls}>
        <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
      </button>
    </div>
  );
}

function PauseButton({ playing, onToggle }: { playing: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={playing ? "Pausar a troca automática" : "Retomar a troca automática"}
      className="flex h-8 w-8 items-center justify-center rounded-full border border-ink/15 text-ink/70 transition hover:border-ink/40 hover:text-ink"
    >
      {playing ? <Pause className="h-3 w-3" strokeWidth={1.75} /> : <Play className="h-3 w-3" strokeWidth={1.75} />}
    </button>
  );
}
