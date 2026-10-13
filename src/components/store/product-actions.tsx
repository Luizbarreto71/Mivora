"use client";

import { Heart, ShoppingBag } from "lucide-react";
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
export function QuickAddButton({ product, className }: { product: ProductSummary; className?: string }) {
  const { add } = useCart();
  const { whatsappNumber, whatsappGreeting, siteUrl, comingSoonInquiry } = useStoreConfig();

  if (product.availability === "coming_soon") {
    if (!whatsappNumber || !comingSoonInquiry) return null;
    const href = buildWhatsAppUrl(whatsappNumber, buildComingSoonMessage({ greeting: whatsappGreeting, productName: product.name, url: `${siteUrl}/produtos/${product.slug}` }));
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={buttonClasses("outline", "sm", cn("w-full", className))}>
        <WhatsAppIcon className="h-3.5 w-3.5" /> Consultar previsão
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
      className={buttonClasses("primary", "sm", cn("w-full", className))}
      aria-label={`Adicionar ${product.name} ao carrinho`}
    >
      <ShoppingBag className="h-3.5 w-3.5" strokeWidth={1.75} /> Adicionar
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
      aria-label={active ? `Remover ${productName} dos favoritos` : `Salvar ${productName} nos favoritos`}
      className={cn("flex h-10 w-10 items-center justify-center rounded-full bg-paper/80 backdrop-blur transition hover:bg-paper", className)}
    >
      <Heart className={cn("h-[18px] w-[18px] transition", active && "fill-ink")} strokeWidth={1.5} />
    </button>
  );
}
