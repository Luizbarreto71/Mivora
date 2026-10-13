import Image from "next/image";
import Link from "next/link";
import type { ProductSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ProductImagePlaceholder } from "./placeholder";
import { Price } from "./price";
import { FavoriteButton, QuickAddButton } from "./product-actions";

/** Status shown under the price — always the real availability registered in the admin. */
function statusPill(product: ProductSummary) {
  if (product.availability === "coming_soon") return { label: "Em breve", tone: "rose" as const };
  if (!product.isAvailable) return { label: product.availability === "on_request" ? "Sob consulta" : "Esgotado", tone: "outline" as const };
  if (product.compareAtCents != null && product.priceCents != null) return { label: "Oferta", tone: "dark" as const };
  if (product.isNew) return { label: "Novidade", tone: "rose" as const };
  return null;
}

const PILL = {
  rose: "bg-[var(--color-rose)] text-[var(--color-rose-ink)]",
  outline: "border border-line text-muted",
  dark: "bg-ink text-paper",
};

export function ProductCard({ product, priority = false, className }: { product: ProductSummary; priority?: boolean; className?: string }) {
  const href = `/produtos/${product.slug}`;
  const pill = statusPill(product);
  return (
    <article className={cn("group relative flex flex-col border border-line bg-paper transition-[border-color,box-shadow] duration-300 hover:border-ink/20 hover:shadow-[0_18px_40px_-28px_rgba(0,0,0,0.25)]", className)}>
      <div className="relative aspect-square overflow-hidden bg-[var(--color-card)]">
        <Link href={href} className="absolute inset-0" aria-label={product.name} tabIndex={-1}>
          {product.image ? (
            <Image
              src={product.image.url}
              alt={product.image.alt ?? product.name}
              fill
              preload={priority}
              sizes="(min-width: 1280px) 20vw, (min-width: 768px) 30vw, 70vw"
              className="product-photo object-contain p-[11%] transition-transform duration-700 ease-[var(--ease-soft)] group-hover:scale-[1.04]"
            />
          ) : (
            <ProductImagePlaceholder name={product.name} brand={product.brand.name} />
          )}
        </Link>
        <FavoriteButton productId={product.id} productName={product.name} className="absolute right-2 top-2 z-10 h-9 w-9 bg-paper/90" />
        {!product.hasVariants ? (
          <div className="absolute inset-x-3 bottom-3 hidden translate-y-2 opacity-0 transition-all duration-300 group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:translate-y-0 group-hover:opacity-100 md:block">
            <QuickAddButton product={product} />
          </div>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col border-t border-line/70 px-3.5 pb-4 pt-3 sm:px-4">
        <p className="text-[0.6875rem] text-muted">{product.brand.name}</p>
        <h3 className="mt-1 line-clamp-2 text-[0.8125rem] font-medium leading-snug sm:text-[0.875rem]">
          <Link href={href} className="after:absolute after:inset-0 hover:underline hover:underline-offset-4 md:after:content-none">
            {product.name}
          </Link>
        </h3>
        {product.volume ? <p className="mt-0.5 text-[0.6875rem] text-muted">{product.volume}</p> : null}
        <div className="mt-auto pt-2.5">
          {product.availability === "coming_soon" && product.priceCents == null ? (
            <span className="text-[0.8125rem] font-medium text-muted">Em breve na MIVORA</span>
          ) : (
            <Price priceCents={product.priceCents} compareAtCents={product.compareAtCents} />
          )}
        </div>
        {pill ? <span className={cn("mt-2.5 inline-flex w-fit items-center rounded-full px-2.5 py-1 text-[0.625rem] font-semibold uppercase leading-none tracking-[0.08em]", PILL[pill.tone])}>{pill.label}</span> : null}
        <div className="relative z-10 mt-3 md:hidden">
          {product.hasVariants ? (
            <Link href={href} className="flex h-9 w-full items-center justify-center border border-ink text-[0.6875rem] font-semibold uppercase tracking-[0.14em]">
              Ver opções
            </Link>
          ) : (
            <QuickAddButton product={product} />
          )}
        </div>
      </div>
    </article>
  );
}

export function ProductGrid({ products, priorityCount = 0, className }: { products: ProductSummary[]; priorityCount?: number; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4", className)}>
      {products.map((p, i) => (
        <ProductCard key={p.id} product={p} priority={i < priorityCount} />
      ))}
    </div>
  );
}

/** Home rows: four per line on desktop, a swipeable row on phones. */
export function ProductRail({ products, label }: { products: ProductSummary[]; label: string }) {
  return (
    <ul
      aria-label={label}
      className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:-mx-6 sm:px-6 md:mx-0 md:grid md:grid-cols-4 md:gap-4 md:overflow-visible md:px-0 md:pb-0 [&::-webkit-scrollbar]:hidden"
    >
      {products.map((p) => (
        <li key={p.id} className="flex w-[68%] shrink-0 snap-start sm:w-[44%] md:w-auto">
          <ProductCard product={p} className="w-full" />
        </li>
      ))}
    </ul>
  );
}
