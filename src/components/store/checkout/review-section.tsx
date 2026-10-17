"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { lineTotal, type CartLine } from "@/lib/cart/math";
import { formatBRL } from "@/lib/money";
import { formatCep } from "@/lib/shipping/cep";
import { PAY_METHOD_LABEL, type CardSelection, type CheckoutAddress, type CheckoutIdentity, type PayMethod } from "@/lib/store/checkout-data";
import { formatBrPhone, normalizeBrPhone } from "@/lib/store/customer";
import { maskedCpf } from "./identity-section";

function Block({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="border-b border-line py-4 first:pt-0">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <h3 className="text-[0.8125rem] font-semibold uppercase tracking-[0.12em]">{title}</h3>
        {action}
      </div>
      <div className="text-sm leading-relaxed text-ink-soft">{children}</div>
    </div>
  );
}

function Change({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className="text-xs font-semibold text-rose-ink underline underline-offset-4 hover:text-ink" aria-label={label}>
      Alterar
    </button>
  );
}

const BRAND: Record<string, string> = { master: "Mastercard", visa: "Visa", elo: "Elo", amex: "American Express", hipercard: "Hipercard", diners: "Diners" };

type Props = {
  lines: CartLine[];
  identity: CheckoutIdentity;
  address: CheckoutAddress | null;
  deliveryName: string | null;
  deliveryText: string;
  deliveryEstimate: string | null;
  payMethod: PayMethod;
  card: CardSelection | null;
  totals: { subtotalCents: number; discountCents: number; coupon: string; totalCents: number | null };
  notes: string;
  onNotes: (value: string) => void;
  goTo: (step: "identificacao" | "pagamento") => void;
};

export function ReviewSection(p: Props) {
  return (
    <section aria-labelledby="revisao" className="space-y-1">
      <h2 id="revisao" className="mb-4 text-lg font-semibold">
        Revise seu pedido
      </h2>
      <Block title="Produtos" action={<Link href="/carrinho" className="text-xs font-semibold text-rose-ink underline underline-offset-4 hover:text-ink">Alterar</Link>}>
        <ul className="space-y-1">
          {p.lines.map((l) => (
            <li key={l.key} className="flex justify-between gap-3">
              <span className="min-w-0">
                {l.quantity} × {l.name}
              </span>
              <span className="shrink-0 tabular-nums">{lineTotal(l) == null ? "Sob consulta" : formatBRL(lineTotal(l)!)}</span>
            </li>
          ))}
        </ul>
      </Block>
      <Block title="Seus dados" action={<Change onClick={() => p.goTo("identificacao")} label="Alterar seus dados" />}>
        <p className="font-medium text-ink">
          {p.identity.firstName} {p.identity.lastName}
        </p>
        <p>{p.identity.email}</p>
        <p>
          {normalizeBrPhone(p.identity.phone) ? formatBrPhone(normalizeBrPhone(p.identity.phone)!) : ""}
          {maskedCpf(p.identity.cpf) ? ` · CPF ${maskedCpf(p.identity.cpf)}` : ""}
        </p>
      </Block>
      <Block title="Entrega" action={<Change onClick={() => p.goTo("identificacao")} label="Alterar a entrega" />}>
        {p.address ? (
          <>
            <p className="font-medium text-ink">{p.address.recipient}</p>
            <p>
              {p.address.street}, {p.address.number}
              {p.address.complement ? ` · ${p.address.complement}` : ""}
            </p>
            <p>
              {p.address.district} · {p.address.city}/{p.address.uf} · CEP {formatCep(p.address.cep)}
            </p>
            {p.address.reference ? <p>Referência: {p.address.reference}</p> : null}
          </>
        ) : null}
        <p className="mt-1">
          {p.deliveryName ?? "Entrega"} · {p.deliveryText}
          {p.deliveryEstimate ? ` · prazo estimado: ${p.deliveryEstimate}` : ""}
        </p>
      </Block>
      <Block title="Pagamento" action={<Change onClick={() => p.goTo("pagamento")} label="Alterar a forma de pagamento" />}>
        <p className="font-medium text-ink">{PAY_METHOD_LABEL[p.payMethod]}</p>
        {p.payMethod === "card" && p.card ? (
          <p>
            {BRAND[p.card.paymentMethodId] ?? p.card.paymentMethodId}
            {p.card.lastFour ? ` final ${p.card.lastFour}` : ""} · {p.card.installments === 1 ? "à vista" : `${p.card.installments}x`}
          </p>
        ) : null}
      </Block>
      <div className="py-4">
        <label htmlFor="co-notes" className="mb-1.5 block text-[0.8125rem] font-semibold">
          Observações (opcional)
        </label>
        <textarea
          id="co-notes"
          value={p.notes}
          onChange={(e) => p.onNotes(e.target.value)}
          maxLength={1000}
          rows={3}
          placeholder="Ex.: melhor horário para entrega"
          className="w-full rounded-control border border-line bg-paper px-3.5 py-3 text-[0.9375rem] focus:border-ink focus:outline-none"
        />
      </div>
      <dl className="space-y-1.5 border-t border-line pt-4 text-sm">
        <div className="flex justify-between">
          <dt>Subtotal</dt>
          <dd className="tabular-nums">{formatBRL(p.totals.subtotalCents)}</dd>
        </div>
        {p.totals.discountCents > 0 ? (
          <div className="flex justify-between text-success">
            <dt>Desconto ({p.totals.coupon})</dt>
            <dd className="tabular-nums">- {formatBRL(p.totals.discountCents)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between">
          <dt>Frete</dt>
          <dd className="tabular-nums">{p.deliveryText}</dd>
        </div>
        {p.totals.totalCents != null ? (
          <div className="flex justify-between border-t border-line pt-2 text-base font-semibold">
            <dt>Valor final</dt>
            <dd className="tabular-nums">{formatBRL(p.totals.totalCents)}</dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}
