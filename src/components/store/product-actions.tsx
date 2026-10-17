"use client";

import { Heart, Plus, ShoppingBag } from "lucide-react";
import { lineKey } from "@/lib/cart/math";
import type { ProductSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { buildComingSoonMessage, buildProductInterestMessage, buildWhatsAppUrl } from "@/lib/whatsapp";
import { WhatsAppIcon } from "@/components/brand/social-icons";
import { buttonClasses } from "@/components/ui/button";
import { useCart } from "./cart-context";
import { useStoreConfig } from "./store-config";

export function cartLineFromProduct(product: ProductSummary, variant?: { id: string; name: string; priceCents: number | null; maxQuantity: number | null; isAvailable: boolean } | null) {
  return {
    key: lineKey({ productId: product.id, variantId: variant?.id ?? null }),
    productId: product.id,
    variantId: variant?.id ?? null,
    kitId: null,
    slug: product.slug,
    href: `/produtos/${product.slug}`,
    name: product.name,
    brand: product.brand.name,
    variantName: variant?.name ?? null,
    volume: product.volume,
    imageUrl: product.image?.url ?? null,
    unitPriceCents: variant ? (variant.priceCents ?? product.priceCents) : product.priceCents,
    maxQuantity: variant ? variant.maxQuantity : product.maxQuantity,
    isAvailable: variant ? variant.isAvailable : product.isAvailable,
  };
}

/** Compact add-to-cart used on product cards. Products with variants link to the detail page instead. */
export function QuickAddButton({ product, className, variant = "full" }: { product: ProductSummary; className?: string; variant?: "full" | "icon" }) {
  const { add } = useCart();
  const { whatsappNumber, whatsappGreeting, siteUrl, comingSoonInquiry } = useStoreConfig();

  // phones: only a purchase fits on the photo; consultations stay on the product page
  if (variant === "icon") {
    if (product.availability === "coming_soon" || !product.isAvailable || product.priceCents == null) return null;
    return (
      <button
        type="button"
        onClick={() => add(cartLineFromProduct(product), 1)}
        aria-label={`Adicionar ${product.name} à sacola`}
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-full bg-accent text-paper shadow-[0_8px_18px_-8px_rgba(122,47,69,0.8)] transition active:scale-95 motion-reduce:active:scale-100",
          className,
        )}
      >
        <ShoppingBag className="h-[18px] w-[18px]" strokeWidth={1.75} />
        <Plus className="-ml-1.5 -mt-3 h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
      </button>
    );
  }

  if (product.availability === "coming_soon") {
    if (!whatsappNumber || !comingSoonInquiry) return null;
    const href = buildWhatsAppUrl(whatsappNumber, buildComingSoonMessage({ greeting: whatsappGreeting, productName: product.name, url: `${siteUrl}/produtos/${product.slug}` }));
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={buttonClasses("outline", "sm", cn("w-full", className))}>
        <WhatsAppIcon className="h-3.5 w-3.5" /> Consultar previsão
      </a>
    );
  }

  if (product.availability === "on_request") {
    if (!whatsappNumber) return null;
    const href = buildWhatsAppUrl(
      whatsappNumber,
      buildProductInterestMessage({ greeting: whatsappGreeting, productName: product.name, url: `${siteUrl}/produtos/${product.slug}`, priceCents: product.priceCents }),
    );
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={buttonClasses("outline", "sm", cn("w-full", className))}>
        <WhatsAppIcon className="h-3.5 w-3.5" /> {product.priceCents == null ? "Consultar preço" : "Consultar"}
      </a>
    );
  }

  if (!product.isAvailable) {
    if (!whatsappNumber) return null;
    const href = buildWhatsAppUrl(
      whatsappNumber,
      buildProductInterestMessage({ greeting: whatsappGreeting, productName: product.name, url: `${siteUrl}/produtos/${product.slug}`, priceCents: null }).replace(
        "Gostaria de saber o preço e a disponibilidade.",
        "Gostaria de saber quando estará disponível.",
      ),
    );
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={buttonClasses("outline", "sm", cn("w-full", className))}>
        <WhatsAppIcon className="h-3.5 w-3.5" /> Avise-me
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={() => add(cartLineFromProduct(product), 1)}
      className={buttonClasses("accent", "sm", cn("h-10 w-full", className))}
      aria-label={`Adicionar ${product.name} à sacola`}
    >
      <ShoppingBag className="h-3.5 w-3.5" strokeWidth={1.75} /> Adicionar à sacola
    </button>
  );
}

export function FavoriteButton({ productId, productName, className }: { productId: string; productName: string; className?: string }) {
  const { isFavorite, toggleFavorite, hydrated } = useCart();
  const active = hydrated && isFavorite(productId);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        toggleFavorite(productId);
      }}
      aria-pressed={active}
      data-active={active}
      aria-label={active ? `Remover ${productName} dos favoritos` : `Salvar ${productName} nos favoritos`}
      className={cn("flex h-10 w-10 items-center justify-center rounded-full bg-paper/80 backdrop-blur transition hover:bg-paper", className)}
    >
      <Heart className={cn("h-[18px] w-[18px] transition", active && "fill-ink")} strokeWidth={1.5} />
    </button>
  );
}
