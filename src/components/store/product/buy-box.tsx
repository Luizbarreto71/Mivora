"use client";

import { Check, Clock, CreditCard, Gift, Link2, Share2, ShoppingBag, Truck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { WhatsAppIcon } from "@/components/brand/social-icons";
import { buttonClasses } from "@/components/ui/button";
import type { ProductDetail } from "@/lib/types";
import { AVAILABILITY_LABEL } from "@/lib/types";
import { cn } from "@/lib/utils";
import { buildComingSoonMessage, buildProductInterestMessage, buildWhatsAppUrl } from "@/lib/whatsapp";
import { useCart } from "../cart-context";
import { Price } from "../price";
import { cartLineFromProduct, FavoriteButton } from "../product-actions";
import { QuantityStepper } from "../quantity-stepper";
import { ShippingCalculator } from "../shipping-calculator";
import { useStoreConfig } from "../store-config";

export function BuyBox({ product }: { product: ProductDetail }) {
  const { add } = useCart();
  const { whatsappNumber, whatsappGreeting, deliverySummary, businessHours, siteUrl, comingSoonInquiry, welcomeOffer, shippingCalculator } = useStoreConfig();
  const [variantId, setVariantId] = useState<string | null>(product.variants[0]?.id ?? null);
  const [quantity, setQuantity] = useState(1);
  const [showSticky, setShowSticky] = useState(false);
  const ctaRef = useRef<HTMLDivElement>(null);

  const variant = product.variants.find((v) => v.id === variantId) ?? null;
  const priceCents = variant ? (variant.priceCents ?? product.priceCents) : product.priceCents;
  const compareAtCents = variant ? variant.compareAtCents : product.compareAtCents;
  const maxQuantity = variant ? variant.maxQuantity : product.maxQuantity;
  const isAvailable = variant ? variant.isAvailable : product.isAvailable;
  const productUrl = `${siteUrl}/produtos/${product.slug}`;

  useEffect(() => {
    const el = ctaRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setShowSticky(!entry.isIntersecting && entry.boundingClientRect.top < 0), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const addToCart = () => add(cartLineFromProduct(product, variant), quantity);

  const comingSoon = product.availability === "coming_soon";
  const whatsappHref = comingSoon
    ? whatsappNumber && comingSoonInquiry
      ? buildWhatsAppUrl(whatsappNumber, buildComingSoonMessage({ greeting: whatsappGreeting, productName: product.name, url: productUrl }))
      : null
    : whatsappNumber
    ? buildWhatsAppUrl(
        whatsappNumber,
        buildProductInterestMessage({
          greeting: whatsappGreeting,
          productName: variant ? `${product.name} — ${variant.name}` : product.name,
          url: productUrl,
          priceCents,
        }) + (quantity > 1 ? `\nQuantidade desejada: ${quantity}` : ""),
      )
    : null;

  const stockNote = comingSoon
    ? "Em breve — ainda não disponível para compra"
    : !isAvailable
      ? product.availability === "on_request"
        ? "Disponível sob consulta"
        : "Esgotado no momento"
      : maxQuantity != null && maxQuantity <= 3
        ? `Últimas ${maxQuantity} ${maxQuantity === 1 ? "unidade" : "unidades"}`
        : AVAILABILITY_LABEL.in_stock;

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        {comingSoon && priceCents == null ? (
          <span className="heading-display text-xl">Em breve na MIVORA</span>
        ) : (
          <Price priceCents={priceCents} compareAtCents={compareAtCents} size="lg" />
        )}
        <FavoriteButton productId={product.id} productName={product.name} className="-mr-2 -mt-1 bg-ivory" />
      </div>
      {priceCents == null && !comingSoon ? <p className="mt-2 text-sm text-muted">Fale com a gente pelo WhatsApp para saber o valor atual.</p> : null}
      {comingSoon ? (
        <div className="mt-5 border border-line bg-ivory p-4 text-sm leading-relaxed text-ink-soft" role="note">
          <p className="font-semibold text-ink">Este produto ainda não está disponível.</p>
          <p className="mt-1">Ele faz parte dos próximos lançamentos da MIVORA e não pode ser comprado nem entregue no momento.{product.comingSoonNote ? ` ${product.comingSoonNote}` : ""}</p>
        </div>
      ) : null}

      <p className={cn("mt-5 flex items-center gap-2 text-sm", isAvailable ? "text-success" : "text-muted")}>
        <span className={cn("h-2 w-2 rounded-full", isAvailable ? "bg-success" : "bg-muted")} aria-hidden="true" />
        {stockNote}
      </p>

      {product.variants.length > 0 ? (
        <fieldset className="mt-7">
          <legend className="mb-3 text-[0.6875rem] font-semibold uppercase tracking-[0.18em]">Opção</legend>
          <div className="flex flex-wrap gap-2">
            {product.variants.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => {
                  setVariantId(v.id);
                  setQuantity(1);
                }}
                aria-pressed={v.id === variantId}
                className={cn(
                  "min-h-11 border px-4 text-sm transition",
                  v.id === variantId ? "border-ink bg-ink text-paper" : "border-line hover:border-ink",
                  !v.isAvailable && "text-muted line-through",
                )}
              >
                {v.name}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div ref={ctaRef} className="mt-8 space-y-3">
        {isAvailable ? (
          <div className="flex gap-3">
            <QuantityStepper value={quantity} onChange={setQuantity} max={maxQuantity} />
            <button type="button" onClick={addToCart} className={buttonClasses("primary", "lg", "min-w-0 flex-1 px-4 whitespace-normal text-center leading-tight sm:px-8")}>
              <ShoppingBag className="h-4 w-4" strokeWidth={1.75} /> Adicionar ao carrinho
            </button>
          </div>
        ) : null}
        {whatsappHref ? (
          <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className={buttonClasses(isAvailable ? "outline" : "primary", "lg", "w-full")}>
            <WhatsAppIcon className="h-4 w-4" /> {comingSoon
              ? "Consultar previsão de chegada"
              : isAvailable
                ? "Comprar pelo WhatsApp"
                : product.availability === "on_request"
                  ? priceCents == null
                    ? "Consultar preço pelo WhatsApp"
                    : "Consultar disponibilidade"
                  : "Consultar disponibilidade"}
          </a>
        ) : null}
      </div>

      {shippingCalculator && isAvailable && !comingSoon ? (
        <ShippingCalculator className="mt-6 border border-line p-4 sm:p-5" items={[{ productId: product.id, variantId, kitId: null, quantity }]} />
      ) : null}

      <ul className={cn("mt-8 space-y-3 border-t border-line pt-6 text-sm text-ink-soft", comingSoon && "hidden")}>
        {welcomeOffer ? (
          <li className="flex gap-3">
            <Gift className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} />
            <span>
              {welcomeOffer.percent}% OFF na primeira compra com o cupom <strong className="tracking-[0.12em] text-ink">{welcomeOffer.code}</strong>
            </span>
          </li>
        ) : null}
        <li className="flex gap-3">
          <Truck className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} />
          <span>{deliverySummary ?? "Entrega combinada pelo WhatsApp, de acordo com a sua região."}</span>
        </li>
        <li className="flex gap-3">
          <Check className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} />
          <span>Compra sem cadastro: finalize o pedido com atendimento humano pelo WhatsApp.</span>
        </li>
        <li className="flex gap-3">
          <CreditCard className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} />
          <span>Pagamento combinado no atendimento, depois da confirmação do pedido.</span>
        </li>
        {businessHours ? (
          <li className="flex gap-3">
            <Clock className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} />
            <span>Atendimento: {businessHours}</span>
          </li>
        ) : null}
      </ul>

      <ShareButtons url={productUrl} title={product.name} />

      {/* Sticky purchase bar (mobile) once the main CTA scrolls away */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur transition-transform duration-300 lg:hidden",
          showSticky ? "translate-y-0" : "translate-y-full",
        )}
        aria-hidden={!showSticky}
      >
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-muted">{product.name}</p>
            <Price priceCents={priceCents} compareAtCents={compareAtCents} className="text-sm" />
          </div>
          {isAvailable ? (
            <button type="button" onClick={addToCart} tabIndex={showSticky ? 0 : -1} className={buttonClasses("primary", "md", "shrink-0")}>
              Adicionar
            </button>
          ) : whatsappHref ? (
            <a href={whatsappHref} target="_blank" rel="noopener noreferrer" tabIndex={showSticky ? 0 : -1} className={buttonClasses("primary", "md", "shrink-0")}>
              <WhatsAppIcon className="h-4 w-4" /> {comingSoon ? "Previsão" : "Consultar"}
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ShareButtons({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCanShare(typeof navigator !== "undefined" && "share" in navigator);
  }, []);
  return (
    <div className="mt-6 flex flex-wrap items-center gap-2 text-xs">
      <span className="mr-1 text-muted">Compartilhar:</span>
      <a
        href={`https://wa.me/?text=${encodeURIComponent(`${title} — ${url}`)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-9 items-center gap-1.5 rounded-full border border-line px-3 hover:border-ink"
      >
        <WhatsAppIcon className="h-3.5 w-3.5" /> WhatsApp
      </a>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            window.prompt("Copie o link:", url);
          }
        }}
        className="flex h-9 items-center gap-1.5 rounded-full border border-line px-3 hover:border-ink"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />} {copied ? "Link copiado" : "Copiar link"}
      </button>
      {canShare ? (
        <button
          type="button"
          onClick={() => navigator.share({ title, url }).catch(() => undefined)}
          className="flex h-9 items-center gap-1.5 rounded-full border border-line px-3 hover:border-ink"
        >
          <Share2 className="h-3.5 w-3.5" /> Mais
        </button>
      ) : null}
    </div>
  );
}
