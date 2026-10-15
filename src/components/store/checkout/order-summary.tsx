"use client";

import { ChevronDown, Tag, X } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { lineTotal, type CartLine } from "@/lib/cart/math";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";

export type SummaryValues = {
  lines: CartLine[];
  subtotalCents: number;
  allUnpriced: boolean;
  hasUnpricedItems: boolean;
  discountCents: number;
  coupon: string;
  deliveryName: string | null;
  deliveryText: string;
  totalCents: number | null;
  paysOnSite: boolean;
  estimateNote: boolean;
};

type CouponProps = {
  welcomeOffer: { code: string; percent: number } | null;
  onApply: (code: string) => string | null;
  onRemove: () => void;
};

function CouponBox({ welcomeOffer, coupon, onApply, onRemove }: CouponProps & { coupon: string }) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (!welcomeOffer) return null;
  if (coupon) {
    return (
      <div className="flex items-center justify-between gap-3 bg-paper px-3 py-2.5 text-sm">
        <span className="flex items-center gap-2">
          <Tag className="h-4 w-4 text-rose-ink" strokeWidth={1.5} />
          <span>
            <strong className="tracking-[0.14em]">{coupon}</strong>
            <span className="block text-xs text-muted">{welcomeOffer.percent}% na primeira compra</span>
          </span>
        </span>
        <button type="button" onClick={onRemove} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-ivory" aria-label="Remover cupom">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }
  const apply = (code: string) => {
    const problem = onApply(code);
    setError(problem);
    if (!problem) setDraft("");
  };
  return (
    <div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          apply(draft);
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value.toUpperCase())}
          placeholder="Cupom de desconto"
          aria-label="Cupom de desconto"
          autoCapitalize="characters"
          className="h-11 min-w-0 flex-1 border border-line bg-paper px-3 text-sm uppercase tracking-[0.1em] focus:border-ink focus:outline-none"
        />
        <button type="submit" className="h-11 border border-ink px-4 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] hover:bg-ink hover:text-paper">
          Aplicar
        </button>
      </form>
      {error ? <p className="mt-1.5 text-xs text-danger">{error}</p> : null}
      <button type="button" onClick={() => apply(welcomeOffer.code)} className="mt-2 text-left text-xs text-rose-ink underline underline-offset-2 hover:text-ink">
        Primeira compra? Aplicar {welcomeOffer.code} e ganhar {welcomeOffer.percent}% OFF
      </button>
    </div>
  );
}

function SummaryBody({ values, coupon }: { values: SummaryValues; coupon: CouponProps }) {
  const v = values;
  return (
    <>
      <ul className="divide-y divide-line/80">
        {v.lines.map((l) => {
          const total = lineTotal(l);
          return (
            <li key={l.key} className={cn("flex gap-3 py-3", !l.isAvailable && "opacity-60")}>
              <span className="relative h-16 w-14 shrink-0 bg-paper">
                {l.imageUrl ? <Image src={l.imageUrl} alt="" fill sizes="56px" className="product-photo object-contain p-1" /> : null}
              </span>
              <span className="min-w-0 flex-1 text-sm">
                <span className="line-clamp-2">{l.name}</span>
                <span className="text-xs text-muted">
                  {l.quantity} × {l.unitPriceCents == null ? "preço sob consulta" : formatBRL(l.unitPriceCents)}
                </span>
                {!l.isAvailable ? <span className="block text-xs text-danger">Indisponível</span> : null}
              </span>
              <span className="text-sm font-medium tabular-nums">{total == null ? "—" : formatBRL(total)}</span>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 border-t border-line pt-4">
        <CouponBox {...coupon} coupon={v.coupon} />
      </div>
      <dl className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
        <div className="flex justify-between">
          <dt>Subtotal</dt>
          <dd className="font-semibold tabular-nums">{v.allUnpriced ? "Sob consulta" : formatBRL(v.subtotalCents)}</dd>
        </div>
        {v.discountCents > 0 ? (
          <div className="flex justify-between text-success">
            <dt>Desconto ({v.coupon})</dt>
            <dd className="tabular-nums">- {formatBRL(v.discountCents)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-3 text-muted">
          <dt className="min-w-0">
            Frete
            {v.deliveryName ? <span className="block text-xs">{v.deliveryName}</span> : null}
          </dt>
          <dd className="shrink-0 tabular-nums">{v.deliveryText}</dd>
        </div>
        {v.totalCents != null ? (
          <div className="flex justify-between border-t border-line pt-2 text-base">
            <dt className="font-semibold">{v.paysOnSite ? "Total a pagar" : "Total estimado"}</dt>
            <dd className="font-semibold tabular-nums">{formatBRL(v.totalCents)}</dd>
          </div>
        ) : null}
        {v.hasUnpricedItems && !v.allUnpriced ? <p className="text-xs text-muted">Itens com preço sob consulta não entram no subtotal.</p> : null}
        {v.estimateNote ? <p className="text-xs text-muted">*Estimativa sujeita a confirmação no atendimento.</p> : null}
      </dl>
    </>
  );
}

/** Order summary: a sticky column on large screens, a collapsible panel at the top on phones (one copy in the page). */
export function OrderSummary({ values, coupon, className }: { values: SummaryValues; coupon: CouponProps; className?: string }) {
  const [open, setOpen] = useState(false);
  const shortTotal = values.totalCents != null ? formatBRL(values.totalCents) : values.allUnpriced ? "Sob consulta" : formatBRL(values.subtotalCents - values.discountCents);
  return (
    <aside aria-label="Resumo do pedido" className={cn("h-fit border border-line bg-ivory lg:sticky lg:top-36 lg:border-0 lg:p-6", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-sm lg:hidden"
      >
        <span className="flex items-center gap-2 font-semibold">
          Resumo do pedido
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} strokeWidth={1.75} />
        </span>
        <span className="font-semibold tabular-nums">{shortTotal}</span>
      </button>
      <p className="eyebrow mb-3 hidden text-ink lg:block">Resumo do pedido</p>
      <div className={cn("border-t border-line px-4 pb-4 lg:block lg:border-0 lg:p-0", open ? "block" : "hidden")}>
        <SummaryBody values={values} coupon={coupon} />
      </div>
    </aside>
  );
}
