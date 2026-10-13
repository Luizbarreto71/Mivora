import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { BrandWithCount } from "@/lib/catalog/queries";
import type { ProductSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ProductCard } from "../product-card";

/** Editorial brand block: brand story on one side, its published products on the other. */
export function BrandSpotlight({
  brand,
  products,
  eyebrow,
  title,
  reverse = false,
}: {
  brand: BrandWithCount;
  products: ProductSummary[];
  eyebrow: string;
  title: string;
  reverse?: boolean;
}) {
  const shown = products.slice(0, 3);
  return (
    <section className="container-page pt-24 sm:pt-32" aria-label={title}>
      <div className={cn("grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,2fr)] lg:gap-14", reverse && "lg:grid-cols-[minmax(0,2fr)_minmax(0,0.9fr)]")}>
        <div className={cn("relative flex min-h-80 flex-col justify-between overflow-hidden bg-ivory p-8 sm:p-10", reverse && "lg:order-2")}>
          {brand.coverImage ? (
            <div className="absolute bottom-0 right-0 h-1/2 w-1/2" aria-hidden="true">
              <Image src={brand.coverImage} alt="" fill sizes="20vw" className="product-photo object-contain object-right-bottom p-4 opacity-30" />
            </div>
          ) : null}
          <div className="relative">
            <p className="eyebrow mb-4">{eyebrow}</p>
            <h2 className="heading-display text-[2.5rem] leading-[1.02] sm:text-[3rem]">{title}</h2>
            {brand.description ? <p className="mt-5 max-w-sm text-[0.9375rem] leading-relaxed text-muted">{brand.description}</p> : null}
          </div>
          <Link href={`/marcas/${brand.slug}`} className="group relative mt-10 inline-flex items-center gap-2 self-start text-[0.6875rem] font-semibold uppercase tracking-[0.2em]">
            <span className="border-b border-ink pb-1">Ver todos · {brand.productCount}</span>
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-10 sm:gap-x-5 md:grid-cols-3">
          {shown.map((p, i) => (
            <ProductCard key={p.id} product={p} className={i === 2 ? "hidden md:flex" : undefined} />
          ))}
        </div>
      </div>
    </section>
  );
}
