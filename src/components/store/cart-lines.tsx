"use client";

import { Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { lineTotal, type CartLine } from "@/lib/cart/math";
import { formatBRL } from "@/lib/money";
import { refreshCartLines } from "@/lib/store/actions";
import { cn } from "@/lib/utils";
import { useCart } from "./cart-context";
import { QuantityStepper } from "./quantity-stepper";
import { useStoreConfig } from "./store-config";

/** Re-validates prices/availability against the database whenever the set of lines changes. */
export function useCartRefresh(enabled: boolean) {
  const { lines, applyUpdates, hydrated } = useCart();
  const signature = lines.map((l) => l.key).join("|");
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !hydrated || !signature || last.current === signature) return;
    last.current = signature;
    const refs = lines.map((l) => ({ productId: l.productId, variantId: l.variantId, kitId: l.kitId }));
    refreshCartLines(refs)
      .then(applyUpdates)
      .catch(() => {
        last.current = null;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, hydrated, signature]);
}

export function CartLineItem({ line, compact = false }: { line: CartLine; compact?: boolean }) {
  const { setQuantity, remove, close } = useCart();
  const unavailable = !line.isAvailable || (line.maxQuantity != null && line.maxQuantity < 1);
  const total = lineTotal(line);
  return (
    <li className={cn("flex gap-4 py-5", unavailable && "opacity-70")}>
      <Link href={line.href} onClick={close} className={cn("relative shrink-0 bg-ivory", compact ? "h-24 w-20" : "h-32 w-26 sm:h-36 sm:w-28")}>
        {line.imageUrl ? (
          <Image src={line.imageUrl} alt="" fill sizes="112px" className="product-photo object-contain p-2" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-[0.5625rem] uppercase tracking-[0.16em] text-muted">Foto em breve</span>
        )}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {line.brand ? <p className="eyebrow text-[0.625rem]">{line.brand}</p> : null}
            <Link href={line.href} onClick={close} className="mt-1 line-clamp-2 text-sm leading-snug hover:underline">
              {line.name}
            </Link>
            {line.variantName ? <p className="mt-0.5 text-xs text-muted">{line.variantName}</p> : null}
            {!line.variantName && line.volume ? <p className="mt-0.5 text-xs text-muted">{line.volume}</p> : null}
          </div>
          <button
            type="button"
            onClick={() => remove(line.key)}
            className="-mr-2 -mt-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-ivory hover:text-ink"
            aria-label={`Remover ${line.name}`}
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>
        <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-3">
          {unavailable ? (
            <p className="text-xs font-medium text-danger">Indisponível no momento — remova para continuar</p>
          ) : (
            <QuantityStepper size="sm" value={line.quantity} max={line.maxQuantity} onChange={(q) => setQuantity(line.key, q)} label={`Quantidade de ${line.name}`} />
          )}
          <div className="text-right">
            {total == null ? (
              <p className="text-xs font-medium text-muted">Preço sob consulta</p>
            ) : (
              <>
                <p className="text-sm font-semibold tabular-nums">{formatBRL(total)}</p>
                {line.quantity > 1 && line.unitPriceCents != null ? (
                  <p className="text-[0.6875rem] text-muted tabular-nums">{formatBRL(line.unitPriceCents)} cada</p>
                ) : null}
              </>
            )}
          </div>
        </div>
        {!unavailable && line.maxQuantity != null && line.quantity >= line.maxQuantity ? (
          <p className="mt-2 text-[0.6875rem] text-muted">Quantidade máxima disponível em estoque.</p>
        ) : null}
      </div>
    </li>
  );
}

export function CartSummary({ className }: { className?: string }) {
  const { totals } = useCart();
  const { welcomeOffer } = useStoreConfig();
  const allUnpriced = totals.purchasableLines.length > 0 && totals.purchasableLines.every((l) => l.unitPriceCents == null);
  return (
    <div className={cn("space-y-2 text-sm", className)}>
      <div className="flex items-baseline justify-between">
        <span className="text-muted">Itens</span>
        <span className="tabular-nums">{totals.itemCount}</span>
      </div>
      <div className="flex items-baseline justify-between">
        <span className="font-semibold">Subtotal dos produtos</span>
        <span className="text-base font-semibold tabular-nums">{allUnpriced ? "Sob consulta" : formatBRL(totals.subtotalCents)}</span>
      </div>
      {totals.hasUnpricedItems && !allUnpriced ? (
        <p className="text-xs leading-relaxed text-muted">Itens com preço sob consulta não entram no subtotal. O valor será informado no WhatsApp.</p>
      ) : null}
      {welcomeOffer ? (
        <p className="bg-blush/60 px-3 py-2 text-xs leading-relaxed text-ink">
          Primeira compra? Use o cupom <strong className="tracking-[0.14em]">{welcomeOffer.code}</strong> ao finalizar e ganhe {welcomeOffer.percent}% de desconto.
        </p>
      ) : null}
      <p className="text-xs leading-relaxed text-muted">Entrega e pagamento são combinados no atendimento pelo WhatsApp.</p>
    </div>
  );
}
