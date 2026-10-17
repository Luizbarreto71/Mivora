import { ArrowRight, Camera, ScanFace, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import type { Banner } from "@/lib/types";
import { SkinVisual } from "./skin-visual";

const STEPS = [
  { icon: Camera, text: "Envie uma foto do rosto" },
  { icon: ScanFace, text: "Receba a análise visual" },
  { icon: ShoppingBag, text: "Veja os produtos indicados" },
];

/** Permanent home band of the skin analysis (Conteúdo → "Análise de pele — seção da home"). */
export function SkinHomeSection({ banner }: { banner: Banner }) {
  return (
    <section id="analise-de-pele" aria-labelledby="analise-de-pele-titulo" className="container-page scroll-mt-32 pt-14 sm:pt-16">
      <div className="grid overflow-hidden rounded-panel lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]" style={{ backgroundColor: banner.background_color ?? "#F7E8E5" }}>
        <div className="px-6 py-9 sm:px-10 sm:py-12 lg:px-14 lg:py-16">
          {banner.eyebrow ? (
            <p className="inline-flex rounded-full bg-paper/80 px-3 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.2em] text-rose-ink">{banner.eyebrow}</p>
          ) : null}
          <h2 id="analise-de-pele-titulo" className="t-h1 mt-4 max-w-[30rem]">
            {banner.title}
          </h2>
          {banner.subtitle ? <p className="mt-4 max-w-[30rem] text-[0.9375rem] leading-relaxed text-ink/75 sm:text-base">{banner.subtitle}</p> : null}
          <ol className="mt-6 grid max-w-[30rem] gap-2.5 sm:grid-cols-3">
            {STEPS.map(({ icon: Icon, text }, i) => (
              <li key={text} className="flex items-center gap-2.5 text-[0.8125rem] text-ink sm:flex-col sm:items-start">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-paper text-rose-ink">
                  <Icon className="h-4 w-4" strokeWidth={1.5} />
                </span>
                <span>
                  <span className="sr-only">Passo {i + 1}: </span>
                  {text}
                </span>
              </li>
            ))}
          </ol>
          {banner.cta_label && banner.cta_href ? (
            <Link href={banner.cta_href} className={buttonClasses("primary", "lg", "group/cta mt-8 w-full gap-3 whitespace-normal px-6 text-center sm:w-auto")}>
              {banner.cta_label} <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover/cta:translate-x-0.5" strokeWidth={1.75} />
            </Link>
          ) : null}
          {banner.footnote ? <p className="mt-3 text-xs leading-relaxed text-ink/65">{banner.footnote}</p> : null}
        </div>
        <SkinVisual banner={banner} sizes="(min-width: 1024px) 48vw, 100vw" className="h-64 sm:h-80 lg:h-auto lg:min-h-[28rem]" />
      </div>
    </section>
  );
}
