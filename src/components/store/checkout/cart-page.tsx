"use client";

import Link from "next/link";
import { useState } from "react";
import { buttonClasses } from "@/components/ui/button";
import { formatBRL } from "@/lib/money";
import type { ShippingOption, ShippingQuote } from "@/lib/shipping/types";
import { EmptyState } from "../section";
import { useCart } from "../cart-context";
import { CartLineItem, CartSummary, useCartRefresh } from "../cart-lines";
import { ShippingCalculator, shippingFeeLabel } from "../shipping-calculator";
import { useStoreConfig } from "../store-config";
import { CheckoutSteps } from "./steps";

export function CartPageContent() {
  const { lines, totals, hydrated, clear } = useCart();
  const { shippingCalculator, onlinePayment, whatsappNumber } = useStoreConfig();
  const [, setShippingQuote] = useState<ShippingQuote | null>(null);
  const [shippingOption, setShippingOption] = useState<ShippingOption | null>(null);
  useCartRefresh(true);

  if (!hydrated) return <div className="h-64 animate-pulse bg-ivory" aria-busy="true" />;

  if (lines.length === 0) {
    return (
      <EmptyState
        title="Sua sacola está vazia"
        description="Explore a curadoria MIVORA e adicione seus produtos favoritos."
        action={
          <Link href="/produtos" className={buttonClasses("primary")}>
            Explorar produtos
          </Link>
        }
      />
    );
  }

  const canCheckout = totals.purchasableLines.length > 0 && !totals.hasUnavailableItems;
  const units = lines.reduce((sum, l) => sum + l.quantity, 0);
  const shippingFee = shippingOption && shippingOption.method !== "to_arrange" ? shippingOption.feeCents : null;

  return (
    <>
      <CheckoutSteps current="sacola" />
      <h1 className="heading-display mb-8 mt-8 text-[1.75rem] sm:text-[2.125rem]">
        Sacola <span className="font-normal text-muted">({units} {units === 1 ? "item" : "itens"})</span>
      </h1>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-12">
        <div>
          <ul className="divide-y divide-line border border-line px-4 sm:px-6">
            {lines.map((line) => (
              <CartLineItem key={line.key} line={line} />
            ))}
          </ul>
          <div className="mt-6 flex items-center justify-between">
            <Link href="/produtos" className="text-xs font-semibold uppercase tracking-[0.16em] underline underline-offset-4">
              Continuar comprando
            </Link>
            <button type="button" onClick={clear} className="text-xs text-muted underline underline-offset-4 hover:text-ink">
              Esvaziar sacola
            </button>
          </div>
        </div>
        <aside className="h-fit border border-line bg-paper p-6 sm:p-7 lg:sticky lg:top-40">
          <p className="eyebrow mb-5 text-ink">Resumo</p>
          <CartSummary />
          {shippingCalculator && totals.purchasableLines.length > 0 ? (
            <ShippingCalculator
              className="mt-6 border-t border-line pt-6"
              autoQuote
              rememberChoice
              selectedId={shippingOption?.id ?? null}
              onSelect={setShippingOption}
              onQuote={setShippingQuote}
              items={totals.purchasableLines.map((l) => ({ productId: l.productId, variantId: l.variantId, kitId: l.kitId, quantity: l.quantity }))}
            />
          ) : null}
          {shippingOption ? (
            <div className="mt-4 space-y-2 border-t border-line pt-4 text-sm" aria-live="polite">
              <div className="flex justify-between gap-3">
                <span className="min-w-0">
                  Frete
                  <span className="block text-xs text-muted">{shippingOption.name}</span>
                </span>
                <span className="shrink-0 tabular-nums">{shippingFeeLabel(shippingOption)}</span>
              </div>
              {shippingFee != null && !totals.hasUnpricedItems ? (
                <div className="flex justify-between text-base font-semibold">
                  <span>Total estimado</span>
                  <span className="tabular-nums">{formatBRL(totals.subtotalCents + shippingFee)}</span>
                </div>
              ) : null}
              <p className="text-xs leading-relaxed text-muted">A opção escolhida segue para a próxima etapa. O cupom de primeira compra pode ser aplicado no resumo.</p>
            </div>
          ) : null}
          <div className="mt-7">
            {canCheckout ? (
              <Link href="/finalizar?etapa=identificacao" className={buttonClasses("primary", "lg", "w-full whitespace-normal px-5 text-center")}>
                Continuar para identificação
              </Link>
            ) : (
              <p className="text-sm text-danger">Remova os itens indisponíveis para finalizar o pedido.</p>
            )}
          </div>
          <p className="mt-4 text-xs leading-relaxed text-muted">
            {onlinePayment
              ? `Próximas etapas: seus dados e entrega, pagamento (Pix, cartão ou boleto pelo Mercado Pago${whatsappNumber ? " ou combinado pelo WhatsApp" : ""}) e revisão do pedido.`
              : "Próximas etapas: seus dados e entrega, a forma de pagamento e a revisão do pedido, enviado para a nossa equipe pelo WhatsApp."}
          </p>
        </aside>
      </div>
    </>
  );
}
