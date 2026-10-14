"use client";

import { Check, CreditCard, Loader2, Tag, UserRound, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { WhatsAppIcon } from "@/components/brand/social-icons";
import { Button, buttonClasses } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { deliveryQuote, lineTotal } from "@/lib/cart/math";
import { formatBRL } from "@/lib/money";
import { formatCpf, isValidCpf } from "@/lib/payments/apple-pay-core";
import { destinationLabel } from "@/lib/shipping/cep";
import type { ShippingOption, ShippingQuote } from "@/lib/shipping/types";
import { completeApplePay, payOrder, startApplePayOrder, startOnlinePayment, submitOrder, validateApplePayMerchant } from "@/lib/store/actions";
import { formatBrPhone, readDeviceCustomer, type CustomerProfile } from "@/lib/store/customer";
import { rememberDeviceOrder } from "@/lib/store/order-history";
import { clearCoupon, saveCoupon, savedCoupon } from "@/lib/store/welcome";
import { DELIVERY_METHOD_LABEL, type DeliveryZone } from "@/lib/types";
import { cn } from "@/lib/utils";
import { buildOrderMessage, buildWhatsAppUrl } from "@/lib/whatsapp";
import { useCart } from "../cart-context";
import { EmptyState } from "../section";
import { useCartRefresh } from "../cart-lines";
import { CustomerForm } from "../customer-form";
import { ShippingCalculator } from "../shipping-calculator";
import { useStoreConfig } from "../store-config";
import { ApplePayButton, startApplePaySession, useApplePayAvailable, type PreparedOrder } from "./apple-pay";

const LAST_ORDER_KEY = "mivora.lastOrder";
type LastOrder = { code: string; url: string; summarized: boolean; at: number };

export function CheckoutForm({
  zones,
  calculatorEnabled,
  pickupDetails,
  minimumOrderCents,
  freeShippingThresholdCents,
}: {
  zones: DeliveryZone[];
  /** CEP calculator (zones by CEP/city + carrier quotes) instead of the plain zone list */
  calculatorEnabled: boolean;
  pickupDetails: string | null;
  minimumOrderCents: number | null;
  freeShippingThresholdCents: number | null;
}) {
  const { lines, totals, hydrated, clear } = useCart();
  const { whatsappNumber, whatsappGreeting, welcomeOffer, onlinePayment, applePay } = useStoreConfig();
  useCartRefresh(true);

  const [zoneId, setZoneId] = useState<string | null>(zones.length === 1 ? zones[0].id : null);
  const [shippingQuote, setShippingQuote] = useState<ShippingQuote | null>(null);
  const [shippingOption, setShippingOption] = useState<ShippingOption | null>(null);
  // mandatory registration (lead): remembered on this device after the first time
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [customerChecked, setCustomerChecked] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [notes, setNotes] = useState("");
  // pay on the site (Mercado Pago) or finish with the team on WhatsApp
  const [payWith, setPayWith] = useState<"online" | "applepay" | "whatsapp">("online");
  // Apple Pay: only where the device supports it; the CPF goes to Mercado Pago and is not stored
  const applePayAvailable = useApplePayAvailable(applePay && onlinePayment);
  const [cpf, setCpf] = useState("");
  const [applePayBusy, setApplePayBusy] = useState(false);
  // order already registered for a payment on the site, reused while the cart and the choices stay the same
  const siteOrder = useRef<(PreparedOrder & { signature: string }) | null>(null);
  const [coupon, setCoupon] = useState("");
  const [couponDraft, setCouponDraft] = useState("");
  const [couponError, setCouponError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCustomer(readDeviceCustomer());
    setCustomerChecked(true);
  }, []);

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
  // Delivery: option chosen in the CEP calculator, or the plain zone list
  const zoneBelowMinimum = !calculatorEnabled && quote.belowMinimum;
  const deliveryFeeCents = calculatorEnabled
    ? shippingOption && shippingOption.method !== "to_arrange"
      ? shippingOption.feeCents
      : null
    : zone && zone.method !== "to_arrange"
      ? quote.feeCents
      : null;
  const needsShippingChoice = calculatorEnabled && shippingQuote != null && shippingOption == null;
  // paying on the site needs a known total: every item priced and a delivery with a defined fee
  const onlineBlocker = !onlinePayment
    ? null
    : totals.hasUnpricedItems
      ? "Há itens com preço sob consulta no carrinho. Para eles, finalize pelo WhatsApp."
      : deliveryFeeCents == null
        ? calculatorEnabled
          ? "Calcule o frete pelo CEP e escolha uma entrega com valor definido para pagar pelo site."
          : "Escolha uma opção de entrega com valor definido para pagar pelo site."
        : null;
  const online = onlinePayment && !onlineBlocker && payWith === "online";
  const applePayChosen = applePayAvailable && !onlineBlocker && payWith === "applepay";
  const paysOnSite = online || applePayChosen;
  const mark = paysOnSite ? "" : "*";
  const deliveryText = deliveryFeeCents == null ? (needsShippingChoice ? "Escolha uma opção" : "A combinar") : deliveryFeeCents === 0 ? `Grátis${mark}` : `${formatBRL(deliveryFeeCents)}${mark}`;
  const estimatedTotalCents = deliveryFeeCents != null && !totals.hasUnpricedItems ? totals.subtotalCents - discountCents + deliveryFeeCents : null;

  if (done) return <OrderSent order={done} onNew={() => { sessionStorage.removeItem(LAST_ORDER_KEY); setDone(null); }} />;
  if (!hydrated || !customerChecked) return <div className="h-64 animate-pulse bg-ivory" aria-busy="true" />;
  if (lines.length === 0) {
    return (
      <EmptyState
        title="Seu carrinho está vazio"
        description="Adicione produtos ao carrinho para finalizar o pedido."
        action={<Link href="/produtos" className={buttonClasses("primary")}>Explorar produtos</Link>}
      />
    );
  }

  const needsRegistration = !customer || editingCustomer;
  const blocked = needsRegistration || totals.hasUnavailableItems || zoneBelowMinimum || belowStoreMinimum || (!paysOnSite && !whatsappNumber) || needsShippingChoice;
  const cpfValid = isValidCpf(cpf);

  const buildPayload = () => ({
    items: totals.purchasableLines.map((l) => ({ productId: l.productId, variantId: l.variantId, kitId: l.kitId, quantity: l.quantity })),
    customer,
    customerNotes: notes,
    deliveryZoneId: !calculatorEnabled && zone && zone.method !== "to_arrange" ? zone.id : null,
    shipping: calculatorEnabled && shippingQuote && shippingOption ? { cep: shippingQuote.cep, optionId: shippingOption.id } : null,
    couponCode: coupon,
  });

  const leaveFor = (order: { code: string; orderUrl: string }, url: string) => {
    rememberDeviceOrder({ code: order.code, url: order.orderUrl });
    clear();
    clearCoupon();
    window.location.assign(url);
  };

  // Apple Pay: runs synchronously from the click (Apple requires a user gesture)
  const payWithApplePay = () => {
    if (estimatedTotalCents == null || !cpfValid) return;
    setError(null);
    const payload = buildPayload();
    const signature = JSON.stringify(payload);
    setApplePayBusy(true);
    startApplePaySession({
      label: "MIVORA",
      estimateCents: estimatedTotalCents,
      prepare: async () => {
        const cached = siteOrder.current;
        if (cached && cached.signature === signature) return { ok: true as const, ...cached };
        const r = await startApplePayOrder(payload).catch(() => ({ ok: false as const, error: "Não foi possível registrar o pedido agora." }));
        if (r.ok) siteOrder.current = { signature, orderId: r.orderId, code: r.code, orderUrl: r.orderUrl, amountCents: r.amountCents, lines: r.lines };
        return r;
      },
      validate: (url) => validateApplePayMerchant(url),
      pay: (order, token) => completeApplePay({ orderId: order.orderId, cpf, token }),
      onDone: (order, outcome) => {
        if (outcome.ok && outcome.status !== "rejected" && outcome.status !== "cancelled") {
          leaveFor(order, order.orderUrl);
          return;
        }
        setApplePayBusy(false);
        setError({
          message: outcome.ok ? "O pagamento com Apple Pay não foi aprovado. Tente outro cartão ou escolha Pix, cartão ou boleto pelo Mercado Pago." : outcome.error,
          retryable: false,
        });
      },
      onError: (message) => {
        setApplePayBusy(false);
        setError({ message, retryable: false });
      },
      onCancel: () => setApplePayBusy(false),
    });
  };

  const submit = () => {
    setError(null);
    const payload = buildPayload();
    if (online) {
      startTransition(async () => {
        // an order already registered by an Apple Pay attempt is paid instead of creating another one
        const existing = siteOrder.current?.signature === JSON.stringify(payload) ? siteOrder.current : null;
        if (existing) {
          const opened = await payOrder(existing.orderId).catch(() => ({ ok: false as const, error: "Não foi possível abrir o pagamento agora. Tente novamente em instantes." }));
          if (!opened.ok) {
            setError({ message: opened.error, retryable: false });
            return;
          }
          leaveFor(existing, opened.url);
          await new Promise(() => {});
          return;
        }
        const result = await startOnlinePayment(payload).catch(() => ({ ok: false as const, error: "Não foi possível registrar o pedido agora.", retryable: true }));
        if (!result.ok) {
          setError({ message: result.error, retryable: result.retryable });
          return;
        }
        rememberDeviceOrder({ code: result.code, url: result.orderUrl, at: Date.now() });
        clear();
        clearCoupon();
        // Mercado Pago's page; if it could not be opened, the order page offers to try again
        window.location.assign(result.checkoutUrl ?? result.orderUrl);
        await new Promise(() => {}); // keep the button busy while the browser leaves
      });
      return;
    }
    startTransition(async () => {
      const result = await submitOrder(payload).catch(() => ({ ok: false as const, error: "Não foi possível registrar o pedido agora.", retryable: true }));

      if (!result.ok) {
        setError({ message: result.error, retryable: result.retryable });
        return;
      }
      const order: LastOrder = { code: result.code, url: result.whatsappUrl, summarized: result.summarized, at: Date.now() };
      try {
        sessionStorage.setItem(LAST_ORDER_KEY, JSON.stringify(order));
        rememberDeviceOrder(order);
      } catch {
        /* ignore */
      }
      clear();
      clearCoupon();
      setDone(order);
      window.location.assign(result.whatsappUrl);
    });
  };

  const fallbackDelivery =
    calculatorEnabled && shippingQuote && shippingOption
      ? {
          label: shippingOption.method === "to_arrange" ? null : `${DELIVERY_METHOD_LABEL[shippingOption.method]} (${shippingOption.name})`,
          feeCents: shippingOption.feeCents,
          estimate: shippingOption.estimate,
          destination: destinationLabel({ cep: shippingQuote.cep, city: shippingQuote.address?.city, uf: shippingQuote.address?.uf }),
        }
      : null;

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
            delivery: fallbackDelivery,
            customerName: customer?.name ?? null,
            customerNotes: notes || null,
          }),
        )
      : null;

  return (
    <div className="grid gap-12 lg:grid-cols-[1fr_26rem] lg:gap-16">
      <div className="space-y-10">
        {needsRegistration ? (
          <section aria-labelledby="cadastro" className="border border-line p-5 sm:p-8">
            <p className="eyebrow mb-2">Etapa 1 de 2</p>
            <h2 id="cadastro" className="heading-display text-[1.5rem] sm:text-[1.75rem]">
              {customer ? "Alterar cadastro" : "Seu cadastro"}
            </h2>
            <p className="mb-6 mt-2 text-sm leading-relaxed text-muted">
              Para finalizar a compra, precisamos do seu nome, WhatsApp e e-mail. É rápido, sem senha, e fica lembrado neste aparelho para as próximas compras.
            </p>
            <CustomerForm
              initial={customer}
              source="checkout"
              submitLabel="Continuar para a entrega"
              onDone={(c) => {
                setCustomer(c);
                setEditingCustomer(false);
              }}
              onCancel={customer ? () => setEditingCustomer(false) : undefined}
            />
          </section>
        ) : (
          <section aria-label="Seus dados" className="flex flex-wrap items-start justify-between gap-4 border border-line p-5">
            <div className="flex min-w-0 gap-3">
              <UserRound className="mt-0.5 h-5 w-5 shrink-0 text-ink/70" strokeWidth={1.5} />
              <div className="min-w-0 text-sm">
                <p className="font-semibold">{customer!.name}</p>
                <p className="mt-0.5 break-words text-muted">
                  {formatBrPhone(customer!.phone)} · {customer!.email}
                </p>
              </div>
            </div>
            <button type="button" onClick={() => setEditingCustomer(true)} className="text-xs font-semibold underline underline-offset-4">
              Alterar dados
            </button>
          </section>
        )}

        {needsRegistration ? null : calculatorEnabled ? (
          <fieldset>
            <legend className="eyebrow mb-4 text-ink">Entrega</legend>
            <ShippingCalculator
              items={totals.purchasableLines.map((l) => ({ productId: l.productId, variantId: l.variantId, kitId: l.kitId, quantity: l.quantity }))}
              autoQuote
              rememberChoice
              selectedId={shippingOption?.id ?? null}
              onSelect={setShippingOption}
              onQuote={setShippingQuote}
              title="Calcule o frete pelo CEP"
              note={paysOnSite ? "No pagamento pelo site, o frete escolhido é cobrado junto com o pedido. Os prazos são estimativas." : undefined}
            />
            {!shippingQuote ? <p className="mt-3 text-xs text-muted">Opcional: sem o CEP, combinamos a entrega com você pelo WhatsApp.</p> : null}
            {pickupDetails && shippingQuote?.options.some((o) => o.method === "pickup") ? <p className="mt-3 text-xs text-muted">Retirada: {pickupDetails}</p> : null}
          </fieldset>
        ) : zones.length > 0 ? (
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

        {needsRegistration || !onlinePayment ? null : (
          <fieldset>
            <legend className="eyebrow mb-4 text-ink">Pagamento</legend>
            <div className="grid gap-3">
              <label className={cn("flex gap-3 border p-4 transition", onlineBlocker ? "cursor-not-allowed opacity-60" : "cursor-pointer", online ? "border-ink" : "border-line hover:border-ink/40")}>
                <input type="radio" name="pay-with" className="mt-1 h-4 w-4 accent-ink" checked={online} disabled={Boolean(onlineBlocker)} onChange={() => setPayWith("online")} />
                <span className="min-w-0 flex-1 text-sm">
                  <span className="font-semibold">Pagar agora pelo site</span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted">Pix, cartão de crédito ou boleto, em ambiente seguro do Mercado Pago. O pedido é confirmado assim que o pagamento é aprovado.</span>
                  {onlineBlocker ? <span className="mt-1 block text-xs text-ink-soft">{onlineBlocker}</span> : null}
                </span>
              </label>
              {applePayAvailable ? (
                <div className={cn("border p-4 transition", onlineBlocker && "opacity-60", applePayChosen ? "border-ink" : "border-line hover:border-ink/40")}>
                  <label className={cn("flex gap-3", onlineBlocker ? "cursor-not-allowed" : "cursor-pointer")}>
                    <input type="radio" name="pay-with" className="mt-1 h-4 w-4 accent-ink" checked={applePayChosen} disabled={Boolean(onlineBlocker)} onChange={() => setPayWith("applepay")} />
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="font-semibold">Apple Pay</span>
                      <span className="mt-1 block text-xs leading-relaxed text-muted">Pague com Face ID ou Touch ID. Cartões de crédito Visa e Mastercard, à vista, processado pelo Mercado Pago.</span>
                    </span>
                  </label>
                  {applePayChosen ? (
                    <Field
                      label="Seu CPF"
                      htmlFor="cpf"
                      hint="Exigido pelo Mercado Pago para pagar com Apple Pay. Não fica salvo na loja."
                      error={cpf.length === 14 && !cpfValid ? "CPF inválido. Confira os números." : null}
                      className="mt-4 sm:pl-7"
                    >
                      <Input
                        id="cpf"
                        value={cpf}
                        onChange={(e) => setCpf(formatCpf(e.target.value))}
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="000.000.000-00"
                        maxLength={14}
                        aria-invalid={cpf.length === 14 && !cpfValid ? true : undefined}
                      />
                    </Field>
                  ) : null}
                </div>
              ) : null}
              <label className={cn("flex gap-3 border p-4 transition", whatsappNumber ? "cursor-pointer" : "cursor-not-allowed opacity-60", !paysOnSite ? "border-ink" : "border-line hover:border-ink/40")}>
                <input type="radio" name="pay-with" className="mt-1 h-4 w-4 accent-ink" checked={!paysOnSite} disabled={!whatsappNumber} onChange={() => setPayWith("whatsapp")} />
                <span className="min-w-0 flex-1 text-sm">
                  <span className="font-semibold">Finalizar pelo WhatsApp</span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted">Combine pagamento e entrega com a nossa equipe.</span>
                </span>
              </label>
            </div>
          </fieldset>
        )}

        {needsRegistration ? null : (
          <Field label="Observações (opcional)" htmlFor="notes">
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} placeholder="Ex.: bairro para entrega, melhor horário para contato" />
          </Field>
        )}
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
          <div className="flex justify-between gap-3 text-muted">
            <span className="min-w-0">
              Entrega
              {calculatorEnabled && shippingOption && shippingOption.method !== "to_arrange" ? <span className="block text-xs">{shippingOption.name}</span> : null}
            </span>
            <span className="shrink-0 tabular-nums">{deliveryText}</span>
          </div>
          {estimatedTotalCents != null ? (
            <div className="flex justify-between border-t border-line pt-2 text-base">
              <span className="font-semibold">{paysOnSite ? "Total a pagar" : "Total estimado"}</span>
              <span className="font-semibold tabular-nums">{formatBRL(estimatedTotalCents)}</span>
            </div>
          ) : null}
          {totals.hasUnpricedItems && !allUnpriced ? <p className="text-xs text-muted">Itens com preço sob consulta não entram no subtotal.</p> : null}
          {freeShippingThresholdCents != null ? <p className="text-xs text-muted">Frete grátis a partir de {formatBRL(freeShippingThresholdCents)} nas regiões participantes, confirmado no atendimento.</p> : null}
          {deliveryFeeCents != null && !paysOnSite ? <p className="text-xs text-muted">*Estimativa sujeita a confirmação no atendimento.</p> : null}
        </div>

        <div className="mt-6 space-y-3">
          {needsRegistration ? <p className="text-sm text-ink-soft">Faça seu cadastro para escolher a entrega e finalizar.</p> : null}
          {!whatsappNumber && !paysOnSite ? <p className="text-sm text-danger">O WhatsApp da loja ainda não foi configurado. Tente novamente mais tarde.</p> : null}
          {totals.hasUnavailableItems ? (
            <p className="text-sm text-danger">
              Há itens indisponíveis no carrinho.{" "}
              <Link href="/carrinho" className="underline">
                Revisar carrinho
              </Link>
            </p>
          ) : null}
          {zoneBelowMinimum && zone?.min_order_cents != null ? <p className="text-sm text-danger">Pedido mínimo para esta entrega: {formatBRL(zone.min_order_cents)}.</p> : null}
          {needsShippingChoice ? <p className="text-sm text-ink-soft">Escolha uma opção de entrega para continuar.</p> : null}
          {belowStoreMinimum ? <p className="text-sm text-danger">Pedido mínimo: {formatBRL(minimumOrderCents!)}.</p> : null}
          {error ? (
            <p className="text-sm text-danger" role="alert">
              {error.message}
            </p>
          ) : null}
          {applePayChosen ? (
            <>
              {!cpfValid ? <p className="text-sm text-ink-soft">Informe seu CPF para pagar com Apple Pay.</p> : null}
              <ApplePayButton onClick={payWithApplePay} disabled={blocked || pending || applePayBusy || !cpfValid} />
              <p className="text-center text-xs text-muted">O pagamento é autorizado no seu aparelho e processado pelo Mercado Pago.</p>
            </>
          ) : online ? (
            <Button size="lg" className="w-full" onClick={submit} disabled={blocked || pending} data-mp-checkout-cta="checkout-pro">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" strokeWidth={1.75} />}
              {pending ? "Abrindo o Mercado Pago…" : "Pagar com Mercado Pago"}
            </Button>
          ) : (
            <Button size="lg" className="w-full" onClick={submit} disabled={blocked || pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <WhatsAppIcon className="h-4 w-4" />}
              {pending ? "Registrando pedido…" : "Finalizar pelo WhatsApp"}
            </Button>
          )}
          {online ? <p className="text-center text-xs text-muted">Você será levado ao Mercado Pago para pagar e voltará para a página do seu pedido.</p> : null}
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
      <p className="heading-display mt-2 text-[2rem] tabular-nums">{order.code}</p>
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
