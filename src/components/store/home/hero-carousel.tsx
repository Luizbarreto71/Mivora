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
 * the chosen product under a soft studio light. "Full" slides show finished art (logo and
 * copy already in the image) whole and clickable; their copy stays for screen readers and,
 * on phones, below the image.
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
          const full = s.layout === "full" && Boolean(s.image_desktop_url);
          return (
            <div
              key={s.id}
              role={multiple ? "group" : undefined}
              aria-roledescription={multiple ? "slide" : undefined}
              aria-label={multiple ? `${i + 1} de ${count}` : undefined}
              aria-hidden={active ? undefined : true}
              inert={!active}
              className={cn("relative col-start-1 row-start-1 transition-opacity duration-700 ease-out motion-reduce:transition-none", active ? "z-10 opacity-100" : "pointer-events-none opacity-0")}
              style={{ backgroundColor: s.background_color ?? DEFAULT_BG }}
            >
              <div
                className={cn(
                  "container-page grid gap-6 pb-8 pt-4 sm:pt-6 lg:h-[var(--hero-h)] lg:items-center lg:gap-12 lg:py-10",
                  full ? "lg:grid-cols-1" : "lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]",
                )}
              >
                <div className={cn("order-2 lg:order-1 lg:pb-14", full && "lg:sr-only")}>
                  <div className="max-w-[34rem]">
                    {s.eyebrow ? (
                      <p className={cn("t-label mb-4 text-ink/65", reveal)} style={delay(0)}>
                        {s.eyebrow}
                      </p>
                    ) : null}
                    <Heading className={cn("t-display text-ink", reveal)} style={delay(1)}>
                      {s.title}
                    </Heading>
                    {s.subtitle ? (
                      <p className={cn("t-lead mt-4 line-clamp-3 max-w-[28rem] text-ink/75 sm:mt-5 sm:line-clamp-none", reveal)} style={delay(2)}>
                        {s.subtitle}
                      </p>
                    ) : null}
                    {(s.cta_label && s.cta_href) || (s.cta2_label && s.cta2_href) ? (
                      <div className={cn("mt-7 flex flex-wrap gap-3 sm:mt-8", reveal)} style={delay(3)}>
                        {s.cta_label && s.cta_href ? (
                          <Link href={s.cta_href} className={buttonClasses("primary", "md", "group/cta h-11 gap-3 px-6 sm:h-12 sm:px-7")}>
                            {s.cta_label} <ArrowRight className="h-4 w-4 transition-transform group-hover/cta:translate-x-0.5" strokeWidth={1.75} />
                          </Link>
                        ) : null}
                        {s.cta2_label && s.cta2_href ? (
                          <Link href={s.cta2_href} className={buttonClasses("outline", "md", "h-11 bg-paper/40 px-6 backdrop-blur-sm sm:h-12 sm:px-7")}>
                            {s.cta2_label}
                          </Link>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
                <SlideVisual slide={s} active={active} preload={i === 0} full={full} />
              </div>
            </div>
          );
        })}
      </div>

      {multiple ? (
        <>
          {/* desktop: under the copy, as in the mockup */}
          <div className="pointer-events-none absolute inset-x-0 bottom-5 z-20 hidden lg:block">
            <div className="container-page">
              {/* a light pill keeps the controls legible over photos and finished art */}
              <div className="pointer-events-auto flex w-fit items-center gap-4 rounded-full bg-paper/80 py-1 pl-4 pr-2 backdrop-blur-sm">
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

/**
 * The slide's picture in a soft-cornered frame: campaign photo (separate crop for phones), finished art shown
 * whole (and clickable), or — without a photo — the chosen product under a soft studio light.
 */
function SlideVisual({ slide: s, active, preload, full }: { slide: Banner; active: boolean; preload: boolean; full: boolean }) {
  const motion = cn("absolute inset-0 transition-transform duration-[7000ms] ease-out motion-reduce:transition-none", active ? "scale-100" : "scale-[1.04]");
  const frame = "relative order-1 overflow-hidden rounded-panel lg:order-2";

  if (full) {
    return (
      <Link
        href={s.cta_href ?? "/produtos"}
        aria-label={s.cta_label ? `${s.cta_label}: ${s.title}` : s.title}
        className={cn(frame, "mx-auto block aspect-video w-full lg:h-full lg:w-auto lg:max-w-full")}
      >
        <Image src={s.image_desktop_url!} alt={s.image_alt ?? s.title} fill preload={preload} sizes="(min-width: 1024px) 70vw, 100vw" className="object-contain" />
      </Link>
    );
  }

  if (s.image_desktop_url) {
    return (
      <div className={cn(frame, "aspect-[5/4] sm:aspect-[16/10] lg:aspect-auto lg:h-full")}>
        <div className={motion}>
          {s.image_mobile_url ? (
            <>
              <Image src={s.image_mobile_url} alt={s.image_alt ?? ""} fill preload={preload} sizes="100vw" className="object-cover sm:hidden" />
              <Image src={s.image_desktop_url} alt={s.image_alt ?? ""} fill preload={preload} sizes="(min-width: 1024px) 58vw, 100vw" className="hidden object-cover sm:block" />
            </>
          ) : (
            <Image src={s.image_desktop_url} alt={s.image_alt ?? ""} fill preload={preload} sizes="(min-width: 1024px) 58vw, 100vw" className="object-cover" />
          )}
        </div>
      </div>
    );
  }

  const image = s.product?.image;
  if (!image) return null;
  return (
    <div className={cn(frame, "aspect-[5/4] bg-paper/35 sm:aspect-[16/10] lg:aspect-auto lg:h-full")}>
      {/* studio light: the product photo (white background) blends into it */}
      <div
        aria-hidden="true"
        className="absolute left-1/2 top-1/2 aspect-square h-[125%] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: "radial-gradient(closest-side, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0.88) 42%, rgba(255,255,255,0.35) 68%, rgba(255,255,255,0) 100%)" }}
      />
      <div aria-hidden="true" className="absolute bottom-[8%] left-1/2 h-[6%] w-[34%] -translate-x-1/2 rounded-[50%] bg-ink/10 blur-xl" />
      {/* multiply on the animated wrapper (a transform would isolate a blend set on the image) */}
      <div className={cn(motion, "mix-blend-multiply")}>
        <Image src={image.url} alt={image.alt ?? s.product?.name ?? ""} fill preload={preload} sizes="(min-width: 1024px) 50vw, 100vw" className="object-contain px-[10%] py-[6%]" />
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
            <span className={cn("transition-colors", active ? "text-ink" : "text-ink/60 group-hover:text-ink")}>{String(i + 1).padStart(2, "0")}</span>
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
