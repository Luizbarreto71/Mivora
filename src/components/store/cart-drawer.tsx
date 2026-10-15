"use client";

import { ShoppingBag } from "lucide-react";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useCart } from "./cart-context";
import { CartLineItem, CartSummary, useCartRefresh } from "./cart-lines";

export function CartDrawer() {
  const { isOpen, close, lines, totals } = useCart();
  useCartRefresh(isOpen);
  const canCheckout = totals.purchasableLines.length > 0 && !totals.hasUnavailableItems;

  return (
    <Sheet
      open={isOpen}
      onClose={close}
      title={`Carrinho (${totals.itemCount})`}
      footer={
        lines.length > 0 ? (
          <div className="space-y-4">
            <CartSummary />
            <div className="grid gap-2">
              {canCheckout ? null : <p className="text-center text-xs text-danger">Remova os itens indisponíveis para finalizar.</p>}
              <Link href="/carrinho" onClick={close} className={buttonClasses("primary", "lg", "w-full")}>
                Ver carrinho completo
              </Link>
            </div>
          </div>
        ) : null
      }
    >
      {lines.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center px-8 py-16 text-center">
          <ShoppingBag className="h-8 w-8 text-muted" strokeWidth={1.2} />
          <p className="heading-display mt-5 text-xl">Seu carrinho está vazio</p>
          <p className="mt-2 text-sm text-muted">Explore a curadoria MIVORA e encontre o cuidado ideal para o seu ritual.</p>
          <Link href="/produtos" onClick={close} className={buttonClasses("outline", "md", "mt-7")}>
            Explorar produtos
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-line px-5">
          {lines.map((line) => (
            <CartLineItem key={line.key} line={line} compact />
          ))}
        </ul>
      )}
    </Sheet>
  );
}
