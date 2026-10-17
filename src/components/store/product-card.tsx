import Image from "next/image";
import Link from "next/link";
import type { ProductSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ProductImagePlaceholder } from "./placeholder";
import { Price } from "./price";
import { FavoriteButton, QuickAddButton } from "./product-actions";

type Pill = { label: string; tone: "accent" | "rose" | "light" | "dark" };

/** Labels on the photo — always facts registered in the admin (availability, real offer, flagged as new). */
function pills(product: ProductSummary): Pill[] {
  const list: Pill[] = [];
  if (product.availability === "coming_soon") list.push({ label: "Em breve", tone: "dark" });
  else if (!product.isAvailable) list.push({ label: product.availability === "on_request" ? "Sob consulta" : "Esgotado", tone: "light" });
  if (product.isAvailable && product.compareAtCents != null && product.priceCents != null && product.compareAtCents > product.priceCents) list.push({ label: "Oferta", tone: "accent" });
  if (product.isNew && product.availability !== "coming_soon") list.push({ label: "Novidade", tone: "rose" });
  return list;
}

const PILL = {
  accent: "bg-accent text-paper",
  rose: "bg-rose text-rose-ink",
  light: "bg-paper/90 text-muted ring-1 ring-line",
  dark: "bg-ink text-paper",
};

const canBuy = (p: ProductSummary) => p.availability !== "coming_soon" && p.isAvailable && p.priceCents != null && !p.hasVariants;

export function ProductCard({ product, priority = false, className }: { product: ProductSummary; priority?: boolean; className?: string }) {
  const href = `/produtos/${product.slug}`;
  const labels = pills(product);
  return (
    <article className={cn("group relative flex flex-col", className)}>
      <div className="relative aspect-square overflow-hidden rounded-card bg-card">
        <Link href={href} className="absolute inset-0" aria-label={product.name} tabIndex={-1}>
          {product.image ? (
            <Image
              src={product.image.url}
              alt={product.image.alt ?? product.name}
              fill
              preload={priority}
              sizes="(min-width: 1280px) 22vw, (min-width: 768px) 30vw, 46vw"
              className="product-photo zoom-on-hover object-contain p-[10%]"
            />
          ) : (
            <ProductImagePlaceholder name={product.name} brand={product.brand.name} />
          )}
        </Link>
        {labels.length > 0 ? (
          <div className="pointer-events-none absolute left-2.5 top-2.5 z-10 flex flex-col items-start gap-1.5 sm:left-3 sm:top-3">
            {labels.map((p) => (
              <span key={p.label} className={cn("rounded-full px-2.5 py-1 text-[0.625rem] font-semibold uppercase leading-none tracking-[0.1em]", PILL[p.tone])}>
                {p.label}
              </span>
            ))}
          </div>
        ) : null}
        <FavoriteButton productId={product.id} productName={product.name} className="absolute right-2 top-2 z-10 h-9 w-9 bg-paper/90 opacity-100 shadow-soft md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 md:data-[active=true]:opacity-100" />
        {canBuy(product) ? (
          <>
            {/* computer: the button rises on hover or keyboard focus */}
            <div className="absolute inset-x-3 bottom-3 z-10 hidden translate-y-2 opacity-0 transition-all duration-300 ease-[var(--ease-soft)] group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:translate-y-0 group-hover:opacity-100 md:block">
              <QuickAddButton product={product} />
            </div>
            {/* phone: a compact bag button on the photo */}
            <QuickAddButton product={product} variant="icon" className="absolute bottom-2.5 right-2.5 z-10 md:hidden" />
          </>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col px-0.5 pt-3">
        <p className="text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-muted">{product.brand.name}</p>
        <h3 className="mt-1 line-clamp-2 text-[0.875rem] font-medium leading-snug text-ink">
          <Link href={href} className="after:absolute after:inset-0 after:content-[''] hover:underline hover:underline-offset-4 md:after:content-none">
            {product.name}
          </Link>
        </h3>
        {product.volume ? <p className="mt-0.5 text-[0.75rem] text-muted">{product.volume}</p> : null}
        <div className="mt-auto pt-2">
          {product.availability === "coming_soon" && product.priceCents == null ? (
            <span className="text-[0.8125rem] font-medium text-muted">Em breve na MIVORA</span>
          ) : (
            <Price priceCents={product.priceCents} compareAtCents={product.compareAtCents} />
          )}
        </div>
      </div>
    </article>
  );
}

export function ProductGrid({ products, priorityCount = 0, className }: { products: ProductSummary[]; priorityCount?: number; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-5 sm:gap-y-10 md:grid-cols-3 xl:grid-cols-4", className)}>
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
      className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:-mx-6 sm:gap-5 sm:px-6 md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0 md:pb-0 [&::-webkit-scrollbar]:hidden"
    >
      {products.map((p) => (
        <li key={p.id} className="flex w-[62%] shrink-0 snap-start sm:w-[40%] md:w-auto">
          <ProductCard product={p} className="w-full" />
        </li>
      ))}
    </ul>
  );
}
