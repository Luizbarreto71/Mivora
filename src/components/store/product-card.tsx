import Image from "next/image";
import Link from "next/link";
import type { ProductSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ProductImagePlaceholder } from "./placeholder";
import { Price } from "./price";
import { FavoriteButton, QuickAddButton } from "./product-actions";

export function ProductCard({ product, priority = false, className }: { product: ProductSummary; priority?: boolean; className?: string }) {
  const href = `/produtos/${product.slug}`;
  const onSale = product.compareAtCents != null && product.priceCents != null;
  return (
    <article className={cn("group relative flex flex-col", className)}>
      <div className="relative aspect-[4/5] overflow-hidden bg-ivory">
        <Link href={href} className="absolute inset-0" aria-label={product.name} tabIndex={-1}>
          {product.image ? (
            <Image
              src={product.image.url}
              alt={product.image.alt ?? product.name}
              fill
              preload={priority}
              sizes="(min-width: 1280px) 22vw, (min-width: 768px) 30vw, 46vw"
              className="product-photo object-contain p-[9%] transition-transform duration-700 ease-[var(--ease-soft)] group-hover:scale-[1.04]"
            />
          ) : (
            <ProductImagePlaceholder name={product.name} brand={product.brand.name} />
          )}
        </Link>
        <div className="pointer-events-none absolute left-3 top-3 flex flex-col items-start gap-1.5">
          {product.availability === "coming_soon" ? <Badge tone="dark">Em breve</Badge> : !product.isAvailable ? <Badge tone="outline">{product.availability === "on_request" ? "Sob consulta" : "Esgotado"}</Badge> : null}
          {product.isAvailable && onSale ? <Badge tone="dark">Oferta</Badge> : null}
          {product.isNew ? <Badge tone="blush">Novidade</Badge> : null}
        </div>
        <FavoriteButton productId={product.id} productName={product.name} className="absolute right-2.5 top-2.5 z-10" />
        {!product.hasVariants ? (
          <div className="absolute inset-x-3 bottom-3 hidden translate-y-2 opacity-0 transition-all duration-300 group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:translate-y-0 group-hover:opacity-100 md:block">
            <QuickAddButton product={product} />
          </div>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col pt-4">
        <p className="eyebrow text-[0.625rem]">{product.brand.name}</p>
        <h3 className="mt-1.5 line-clamp-2 text-[0.9375rem] leading-snug">
          <Link href={href} className="after:absolute after:inset-0 md:after:content-none hover:underline hover:underline-offset-4">
            {product.name}
          </Link>
        </h3>
        {product.volume ? <p className="mt-1 text-xs text-muted">{product.volume}</p> : null}
        <div className="mt-auto pt-3">
          {product.availability === "coming_soon" && product.priceCents == null ? (
            <span className="text-[0.8125rem] font-medium text-muted">Em breve na MIVORA</span>
          ) : (
            <Price priceCents={product.priceCents} compareAtCents={product.compareAtCents} />
          )}
        </div>
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
    <div className={cn("grid grid-cols-2 gap-x-3 gap-y-10 sm:gap-x-5 md:grid-cols-3 xl:grid-cols-4", className)}>
      {products.map((p, i) => (
        <ProductCard key={p.id} product={p} priority={i < priorityCount} />
      ))}
    </div>
  );
}
