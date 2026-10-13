"use client";

import { Check, Loader2, Tag, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { WhatsAppIcon } from "@/components/brand/social-icons";
import { Button, buttonClasses } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { deliveryQuote, lineTotal } from "@/lib/cart/math";
import { formatBRL } from "@/lib/money";
import { submitOrder } from "@/lib/store/actions";
import { clearCoupon, saveCoupon, savedCoupon } from "@/lib/store/welcome";
import { DELIVERY_METHOD_LABEL, type DeliveryZone } from "@/lib/types";
import { cn } from "@/lib/utils";
import { buildOrderMessage, buildWhatsAppUrl } from "@/lib/whatsapp";
import { useCart } from "../cart-context";
import { EmptyState } from "../section";
import { useCartRefresh } from "../cart-lines";
import { useStoreConfig } from "../store-config";

const LAST_ORDER_KEY = "mivora.lastOrder";
type LastOrder = { code: string; url: string; summarized: boolean; at: number };

export function CheckoutForm({
  zones,
  pickupDetails,
  minimumOrderCents,
  freeShippingThresholdCents,
}: {
  zones: DeliveryZone[];
  pickupDetails: string | null;
  minimumOrderCents: number | null;
  freeShippingThresholdCents: number | null;
}) {
  const { lines, totals, hydrated, clear } = useCart();
  const { whatsappNumber, whatsappGreeting, welcomeOffer } = useStoreConfig();
  useCartRefresh(true);

  const [zoneId, setZoneId] = useState<string | null>(zones.length === 1 ? zones[0].id : null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [coupon, setCoupon] = useState("");
  const [couponDraft, setCouponDraft] = useState("");
  const [couponError, setCouponError] = useState<string | null>(null);

  // Coupon accepted in the welcome intro is pre-applied
  useEffect(() => {
    const saved = savedCoupon();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (welcomeOffer && saved && saved.toUpperCase() === welcomeOffer.code) setCoupon(welcomeOffer.code);
  }, [welcomeOffer]);

  const applyCoupon = (code: string) => {
    const normalized = code.trim().toUpperCase();
    if (!normalized) return;
    if (!welcomeOffer || normalized !== welcomeOffer.code) {
      setCouponError("Cupom inválido.");
      return;
    }
    setCouponError(null);
    setCoupon(normalized);
    setCouponDraft("");
    saveCoupon(normalized);
  };
  const removeCoupon = () => {
    setCoupon("");
    clearCoupon();
  };
  const [error, setError] = useState<{ message: string; retryable: boolean } | null>(null);
  const [done, setDone] = useState<LastOrder | null>(null);
  const [pending, startTransition] = useTransition();

  // Coming back from WhatsApp: show the confirmation again
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(LAST_ORDER_KEY);
      const last = raw ? (JSON.parse(raw) as LastOrder) : null;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (last && Date.now() - last.at < 30 * 60 * 1000) setDone(last);
    } catch {
      /* ignore */
    }
  }, []);

  const zone = zones.find((z) => z.id === zoneId) ?? null;
  const quote = deliveryQuote(zone ? { feeCents: zone.fee_cents, freeOverCents: zone.free_over_cents, minOrderCents: zone.min_order_cents } : null, totals);
  const belowStoreMinimum = minimumOrderCents != null && !totals.hasUnpricedItems && totals.subtotalCents < minimumOrderCents;
  const allUnpriced = totals.purchasableLines.length > 0 && totals.purchasableLines.every((l) => l.unitPriceCents == null);
  // Estimate only: the server recalculates the discount when the order is registered
  const discountCents = coupon && welcomeOffer ? Math.floor((totals.subtotalCents * welcomeOffer.percent) / 100) : 0;

  if (done) return <OrderSent order={done} onNew={() => { sessionStorage.removeItem(LAST_ORDER_KEY); setDone(null); }} />;
  if (!hydrated) return <div className="h-64 animate-pulse bg-ivory" aria-busy="true" />;
  if (lines.length === 0) {
    return (
      <EmptyState
        title="Seu carrinho está vazio"
        description="Adicione produtos ao carrinho para finalizar o pedido."
        action={<Link href="/produtos" className={buttonClasses("primary")}>Explorar produtos</Link>}
      />
    );
  }

  const blocked = totals.hasUnavailableItems || quote.belowMinimum || belowStoreMinimum || !whatsappNumber;

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await submitOrder({
        items: totals.purchasableLines.map((l) => ({ productId: l.productId, variantId: l.variantId, kitId: l.kitId, quantity: l.quantity })),
        customerName: name,
        customerPhone: phone,
        customerNotes: notes,
        deliveryZoneId: zone && zone.method !== "to_arrange" ? zone.id : null,
        couponCode: coupon,
      }).catch(() => ({ ok: false as const, error: "Não foi possível registrar o pedido agora.", retryable: true }));

      if (!result.ok) {
        setError({ message: result.error, retryable: result.retryable });
        return;
      }
      const order: LastOrder = { code: result.code, url: result.whatsappUrl, summarized: result.summarized, at: Date.now() };
      try {
        sessionStorage.setItem(LAST_ORDER_KEY, JSON.stringify(order));
      } catch {
        /* ignore */
      }
      clear();
      clearCoupon();
      setDone(order);
      window.location.assign(result.whatsappUrl);
    });
  };

  // If the order cannot be registered (e.g. connection issue), the visitor can still talk to the store.
  const fallbackUrl =
    whatsappNumber && error?.retryable
      ? buildWhatsAppUrl(
          whatsappNumber,
          buildOrderMessage({
            greeting: whatsappGreeting,
            code: null,
            items: totals.purchasableLines.map((l) => ({
              name: l.brand && !l.name.toLowerCase().includes(l.brand.toLowerCase()) ? `${l.brand} ${l.name}` : l.name,
              quantity: l.quantity,
              unitPriceCents: l.unitPriceCents,
              lineTotalCents: lineTotal(l),
            })),
            subtotalCents: totals.subtotalCents,
            hasUnpricedItems: totals.hasUnpricedItems,
            customerName: name || null,
            customerNotes: notes || null,
          }),
        )
      : null;

  return (
    <div className="grid gap-12 lg:grid-cols-[1fr_26rem] lg:gap-16">
      <div className="space-y-10">
        {zones.length > 0 ? (
          <fieldset>
            <legend className="eyebrow mb-4 text-ink">Entrega</legend>
            <div className="grid gap-3">
              {zones.map((z) => (
                <label key={z.id} className={cn("flex cursor-pointer gap-3 border p-4 transition", zoneId === z.id ? "border-ink" : "border-line hover:border-ink/40")}>
                  <input type="radio" name="zone" className="mt-1 h-4 w-4 accent-ink" checked={zoneId === z.id} onChange={() => setZoneId(z.id)} />
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-semibold">{z.name}</span>
                      <span className="text-xs text-muted">
                        {z.method === "to_arrange" ? "A combinar" : z.fee_cents == null ? "Valor a combinar" : z.fee_cents === 0 ? "Grátis" : `Taxa estimada ${formatBRL(z.fee_cents)}`}
                      </span>
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed text-muted">
                      {[DELIVERY_METHOD_LABEL[z.method], z.region, z.estimate && `Prazo estimado: ${z.estimate}`, z.free_over_cents != null && `Grátis acima de ${formatBRL(z.free_over_cents)}`, z.min_order_cents != null && `Pedido mínimo ${formatBRL(z.min_order_cents)}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    {z.notes ? <span className="mt-1 block text-xs text-muted">{z.notes}</span> : null}
                  </span>
                </label>
              ))}
            </div>
            {pickupDetails ? <p className="mt-3 text-xs text-muted">Retirada: {pickupDetails}</p> : null}
            <p className="mt-3 text-xs text-muted">Valores e prazos de entrega são confirmados pelo atendimento antes do pagamento.</p>
          </fieldset>
        ) : null}

        <fieldset>
          <legend className="eyebrow mb-1 text-ink">Seus dados (opcional)</legend>
          <p className="mb-5 text-xs text-muted">Não é necessário criar conta. Se preferir, informe seu nome para agilizar o atendimento.</p>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Nome" htmlFor="name">
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" maxLength={120} />
            </Field>
            <Field label="WhatsApp para contato" htmlFor="phone" hint="Opcional">
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^0-9+() -]/g, ""))} inputMode="tel" autoComplete="tel" maxLength={30} />
            </Field>
            <Field label="Observações" htmlFor="notes" className="sm:col-span-2">
              <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} placeholder="Ex.: bairro para entrega, melhor horário para contato" />
            </Field>
          </div>
          <p className="mt-4 text-xs text-muted">
            Usamos estes dados apenas para atender o seu pedido. Saiba mais na{" "}
            <Link href="/politica-de-privacidade" className="underline">
              Política de Privacidade
            </Link>
            .
          </p>
        </fieldset>
      </div>

      <aside className="h-fit bg-ivory p-6 sm:p-8 lg:sticky lg:top-36">
        <p className="eyebrow mb-5 text-ink">Seu pedido</p>
        <ul className="divide-y divide-line/80">
          {lines.map((l) => {
            const total = lineTotal(l);
            const unavailable = !l.isAvailable;
            return (
              <li key={l.key} className={cn("flex gap-3 py-3", unavailable && "opacity-60")}>
                <span className="relative h-16 w-14 shrink-0 bg-paper">
                  {l.imageUrl ? <Image src={l.imageUrl} alt="" fill sizes="56px" className="product-photo object-contain p-1" /> : null}
                </span>
                <span className="min-w-0 flex-1 text-sm">
                  <span className="line-clamp-2">{l.name}</span>
                  <span className="text-xs text-muted">
                    {l.quantity} × {l.unitPriceCents == null ? "preço sob consulta" : formatBRL(l.unitPriceCents)}
                  </span>
                  {unavailable ? <span className="block text-xs text-danger">Indisponível</span> : null}
                </span>
                <span className="text-sm font-medium tabular-nums">{total == null ? "—" : formatBRL(total)}</span>
              </li>
            );
          })}
        </ul>
        {welcomeOffer ? (
          <div className="mt-4 border-t border-line pt-4">
            {coupon ? (
              <div className="flex items-center justify-between gap-3 bg-paper px-3 py-2.5 text-sm">
                <span className="flex items-center gap-2">
                  <Tag className="h-4 w-4" strokeWidth={1.5} />
                  <span>
                    <strong className="tracking-[0.14em]">{coupon}</strong>
                    <span className="block text-xs text-muted">{welcomeOffer.percent}% na primeira compra</span>
                  </span>
                </span>
                <button type="button" onClick={removeCoupon} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-ivory" aria-label="Remover cupom">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div>
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    applyCoupon(couponDraft);
                  }}
                >
                  <input
                    value={couponDraft}
                    onChange={(e) => setCouponDraft(e.target.value.toUpperCase())}
                    placeholder="Cupom de desconto"
                    aria-label="Cupom de desconto"
                    className="h-10 min-w-0 flex-1 border border-line bg-paper px-3 text-sm uppercase tracking-[0.1em] focus:border-ink focus:outline-none"
                  />
                  <button type="submit" className="h-10 border border-ink px-4 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] hover:bg-ink hover:text-paper">
                    Aplicar
                  </button>
                </form>
                {couponError ? <p className="mt-1.5 text-xs text-danger">{couponError}</p> : null}
                <button type="button" onClick={() => applyCoupon(welcomeOffer.code)} className="mt-2 text-left text-xs text-ink-soft underline underline-offset-2 hover:text-ink">
                  Primeira compra? Aplicar {welcomeOffer.code} e ganhar {welcomeOffer.percent}% OFF
                </button>
              </div>
            )}
          </div>
        ) : null}
        <div className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
          <div className="flex justify-between">
            <span>Subtotal dos produtos</span>
            <span className="font-semibold tabular-nums">{allUnpriced ? "Sob consulta" : formatBRL(totals.subtotalCents)}</span>
          </div>
          {discountCents > 0 ? (
            <>
              <div className="flex justify-between text-success">
                <span>Desconto ({coupon})</span>
                <span className="tabular-nums">- {formatBRL(discountCents)}</span>
              </div>
              <div className="flex justify-between text-base">
                <span className="font-semibold">Total dos produtos</span>
                <span className="font-semibold tabular-nums">{formatBRL(totals.subtotalCents - discountCents)}</span>
              </div>
            </>
          ) : null}
          <div className="flex justify-between text-muted">
            <span>Entrega</span>
            <span>{!zone || zone.method === "to_arrange" ? "A combinar" : quote.feeCents == null ? "A combinar" : quote.feeCents === 0 ? "Grátis*" : `${formatBRL(quote.feeCents)}*`}</span>
          </div>
          {totals.hasUnpricedItems && !allUnpriced ? <p className="text-xs text-muted">Itens com preço sob consulta não entram no subtotal.</p> : null}
          {freeShippingThresholdCents != null ? <p className="text-xs text-muted">Frete grátis a partir de {formatBRL(freeShippingThresholdCents)} nas regiões participantes, confirmado no atendimento.</p> : null}
          {zone && zone.method !== "to_arrange" && quote.feeCents != null ? <p className="text-xs text-muted">*Estimativa sujeita a confirmação.</p> : null}
        </div>

        <div className="mt-6 space-y-3">
          {!whatsappNumber ? <p className="text-sm text-danger">O WhatsApp da loja ainda não foi configurado. Tente novamente mais tarde.</p> : null}
          {totals.hasUnavailableItems ? (
            <p className="text-sm text-danger">
              Há itens indisponíveis no carrinho.{" "}
              <Link href="/carrinho" className="underline">
                Revisar carrinho
              </Link>
            </p>
          ) : null}
          {quote.belowMinimum && zone?.min_order_cents != null ? <p className="text-sm text-danger">Pedido mínimo para esta entrega: {formatBRL(zone.min_order_cents)}.</p> : null}
          {belowStoreMinimum ? <p className="text-sm text-danger">Pedido mínimo: {formatBRL(minimumOrderCents!)}.</p> : null}
          {error ? (
            <p className="text-sm text-danger" role="alert">
              {error.message}
            </p>
          ) : null}
          <Button size="lg" className="w-full" onClick={submit} disabled={blocked || pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <WhatsAppIcon className="h-4 w-4" />}
            {pending ? "Registrando pedido…" : "Finalizar pelo WhatsApp"}
          </Button>
          {fallbackUrl ? (
            <a href={fallbackUrl} target="_blank" rel="noopener noreferrer" className={buttonClasses("outline", "md", "w-full")}>
              Enviar lista pelo WhatsApp mesmo assim
            </a>
          ) : null}
          <Link href="/carrinho" className="block text-center text-xs text-muted underline underline-offset-4">
            Voltar ao carrinho
          </Link>
        </div>
      </aside>
    </div>
  );
}

function OrderSent({ order, onNew }: { order: LastOrder; onNew: () => void }) {
  return (
    <div className="mx-auto max-w-xl border border-line px-6 py-14 text-center sm:px-12">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-ink text-paper">
        <Check className="h-5 w-5" />
      </span>
      <p className="eyebrow mt-6">Pedido registrado</p>
      <p className="heading-display mt-2 text-[2.5rem]">{order.code}</p>
      <p className="mt-4 text-sm leading-relaxed text-muted">
        Abrimos uma conversa com a MIVORA no WhatsApp com os detalhes do seu pedido. A compra é concluída após a confirmação de disponibilidade, entrega e pagamento pela nossa equipe.
      </p>
      {order.summarized ? <p className="mt-3 text-xs text-muted">Como o pedido é grande, enviamos um resumo com o código. A lista completa está registrada.</p> : null}
      <div className="mt-8 grid gap-3">
        <a href={order.url} target="_blank" rel="noopener noreferrer" className={buttonClasses("primary", "lg", "w-full")}>
          <WhatsAppIcon className="h-4 w-4" /> Abrir WhatsApp novamente
        </a>
        <Link href="/produtos" onClick={onNew} className={buttonClasses("ghost", "md", "w-full")}>
          Continuar navegando
        </Link>
      </div>
    </div>
  );
}
