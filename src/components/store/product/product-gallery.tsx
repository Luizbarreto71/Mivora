"use client";

import { ChevronLeft, ChevronRight, Play, X, ZoomIn } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ImageRef } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ProductImagePlaceholder } from "../placeholder";

type Media = { kind: "image"; image: ImageRef } | { kind: "video"; url: string };

// packshots keep a margin and blend into the stage; ambience / texture photos fill the frame
const photoClass = (image: ImageRef, pad: string) => (image.fit === "cover" ? "object-cover" : cn("product-photo object-contain", pad));

function videoEmbed(url: string) {
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/);
  if (yt) return { type: "iframe" as const, src: `https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0` };
  if (/\.(mp4|webm)(\?|$)/i.test(url)) return { type: "video" as const, src: url };
  return null;
}

export function ProductGallery({ images, videoUrl, name, brand }: { images: ImageRef[]; videoUrl: string | null; name: string; brand: string }) {
  const embed = videoUrl ? videoEmbed(videoUrl) : null;
  const media: Media[] = [...images.map((image) => ({ kind: "image" as const, image })), ...(embed && videoUrl ? [{ kind: "video" as const, url: videoUrl }] : [])];
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const [lightbox, setLightbox] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  const goTo = useCallback(
    (i: number) => {
      const next = (i + media.length) % media.length;
      setIndex(next);
      const track = trackRef.current;
      if (track) track.scrollTo({ left: next * track.clientWidth, behavior: "smooth" });
    },
    [media.length],
  );

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(false);
      if (e.key === "ArrowRight") goTo(index + 1);
      if (e.key === "ArrowLeft") goTo(index - 1);
    };
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [lightbox, index, goTo]);

  if (media.length === 0) {
    return (
      <div className="relative aspect-square bg-ivory">
        <ProductImagePlaceholder name={name} brand={brand} />
      </div>
    );
  }

  const current = media[index];

  return (
    <div className={cn(media.length > 1 && "lg:grid lg:grid-cols-[4.5rem_1fr] lg:gap-5")}>
      {/* thumbnails (desktop) */}
      {media.length > 1 ? (
        <div className="hidden flex-col gap-3 lg:flex" role="tablist" aria-label="Imagens do produto">
          {media.map((m, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={m.kind === "video" ? "Vídeo do produto" : `Imagem ${i + 1}`}
              onClick={() => setIndex(i)}
              className={cn("relative aspect-square w-full overflow-hidden rounded-control bg-card outline-offset-2 transition", i === index ? "ring-1 ring-ink" : "opacity-70 hover:opacity-100")}
            >
              {m.kind === "image" ? (
                <Image src={m.image.url} alt="" fill sizes="72px" className={photoClass(m.image, "p-1.5")} />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center">
                  <Play className="h-5 w-5" strokeWidth={1.5} />
                </span>
              )}
            </button>
          ))}
        </div>
      ) : null}

      {/* main stage (desktop) */}
      <div className="relative hidden aspect-square overflow-hidden rounded-card bg-card lg:block">
        {current.kind === "image" ? (
          <button
            type="button"
            className="absolute inset-0 cursor-zoom-in"
            onMouseMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
            }}
            onMouseLeave={() => setZoom(null)}
            onClick={() => setLightbox(true)}
            aria-label="Ampliar imagem"
          >
            <Image
              src={current.image.url}
              alt={current.image.alt ?? name}
              fill
              preload={index === 0}
              sizes="(min-width: 1280px) 46vw, 50vw"
              className={cn(photoClass(current.image, "p-[8%]"), "transition-transform duration-200 ease-out")}
              style={zoom ? { transform: "scale(1.9)", transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}
            />
            <span className="absolute bottom-4 right-4 flex h-9 w-9 items-center justify-center rounded-full bg-paper/80">
              <ZoomIn className="h-4 w-4" strokeWidth={1.5} />
            </span>
          </button>
        ) : (
          <VideoPlayer url={current.url} title={name} />
        )}
      </div>

      {/* swipe track (mobile/tablet) */}
      <div className="lg:hidden">
        <div
          ref={trackRef}
          className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          onScroll={(e) => {
            const el = e.currentTarget;
            const i = Math.round(el.scrollLeft / el.clientWidth);
            if (i !== index) setIndex(i);
          }}
        >
          {media.map((m, i) => (
            <div key={i} className="relative aspect-square w-full shrink-0 snap-center overflow-hidden bg-card sm:rounded-card">
              {m.kind === "image" ? (
                <button type="button" className="absolute inset-0" onClick={() => setLightbox(true)} aria-label="Ampliar imagem">
                  <Image src={m.image.url} alt={m.image.alt ?? name} fill preload={i === 0} sizes="100vw" className={photoClass(m.image, "p-[8%]")} />
                </button>
              ) : (
                <VideoPlayer url={m.url} title={name} />
              )}
            </div>
          ))}
        </div>
        {media.length > 1 ? (
          <div className="mt-4 flex justify-center gap-2">
            {media.map((_, i) => (
              <button key={i} type="button" onClick={() => goTo(i)} aria-label={`Ir para mídia ${i + 1}`} className="flex h-6 w-6 items-center justify-center">
                <span className={cn("h-1.5 rounded-full transition-all", i === index ? "w-5 bg-ink" : "w-1.5 bg-ink/25")} />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {lightbox && current.kind === "image" ? (
        <div className="fixed inset-0 z-[80] flex animate-fade-in items-center justify-center bg-paper" role="dialog" aria-modal="true" aria-label={`Imagens de ${name}`}>
          <button type="button" onClick={() => setLightbox(false)} className="absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-full hover:bg-ivory" aria-label="Fechar">
            <X className="h-5 w-5" strokeWidth={1.5} />
          </button>
          <div className="relative h-[86dvh] w-[94vw] max-w-5xl">
            <Image src={current.image.url} alt={current.image.alt ?? name} fill sizes="94vw" className="object-contain" />
          </div>
          {media.length > 1 ? (
            <>
              <button type="button" onClick={() => goTo(index - 1)} className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-ivory" aria-label="Anterior">
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button type="button" onClick={() => goTo(index + 1)} className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-ivory" aria-label="Próxima">
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function VideoPlayer({ url, title }: { url: string; title: string }) {
  const embed = videoEmbed(url);
  if (!embed) return null;
  if (embed.type === "iframe") {
    return <iframe src={embed.src} title={`Vídeo: ${title}`} className="absolute inset-0 h-full w-full" allow="encrypted-media; picture-in-picture" allowFullScreen loading="lazy" />;
  }
  return <video src={embed.src} controls playsInline preload="metadata" className="absolute inset-0 h-full w-full object-contain" />;
}
