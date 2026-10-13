"use client";

import Link from "next/link";
import { WhatsAppIcon } from "@/components/brand/social-icons";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "../section";
import { useCart } from "../cart-context";
import { CartLineItem, CartSummary, useCartRefresh } from "../cart-lines";
import { ShippingCalculator } from "../shipping-calculator";
import { useStoreConfig } from "../store-config";

export function CartPageContent() {
  const { lines, totals, hydrated, clear } = useCart();
  const { shippingCalculator } = useStoreConfig();
  useCartRefresh(true);

  if (!hydrated) return <div className="h-64 animate-pulse bg-ivory" aria-busy="true" />;

  if (lines.length === 0) {
    return (
      <EmptyState
        title="Seu carrinho está vazio"
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

  return (
    <>
      <h1 className="heading-display mb-8 text-[1.75rem] sm:text-[2.125rem]">
        Seu carrinho <span className="font-normal text-muted">({units} {units === 1 ? "item" : "itens"})</span>
      </h1>
      <div className="grid gap-10 lg:grid-cols-[1fr_24rem] lg:gap-12">
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
              Esvaziar carrinho
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
              items={totals.purchasableLines.map((l) => ({ productId: l.productId, variantId: l.variantId, kitId: l.kitId, quantity: l.quantity }))}
            />
          ) : null}
          <div className="mt-7">
            {canCheckout ? (
              <Link href="/finalizar" className={buttonClasses("primary", "lg", "w-full")}>
                <WhatsAppIcon className="h-4 w-4" /> Finalizar pelo WhatsApp
              </Link>
            ) : (
              <p className="text-sm text-danger">Remova os itens indisponíveis para finalizar o pedido.</p>
            )}
          </div>
          <p className="mt-4 text-xs leading-relaxed text-muted">
            Ao finalizar, abriremos uma conversa no WhatsApp com a lista do seu pedido. A compra é confirmada pela nossa equipe.
          </p>
        </aside>
      </div>
    </>
  );
}
