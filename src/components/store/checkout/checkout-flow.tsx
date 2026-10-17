"use client";

import { ArrowLeft, Check, Loader2, Lock } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { WhatsAppIcon } from "@/components/brand/social-icons";
import { Button, buttonClasses } from "@/components/ui/button";
import { deliveryQuote } from "@/lib/cart/math";
import { formatBRL } from "@/lib/money";
import { normalizeCep } from "@/lib/shipping/cep";
import type { ShippingOption, ShippingQuote } from "@/lib/shipping/types";
import { getMyAccount, saveMyAccount, signOutAccount, type Account, type AccountAddress } from "@/lib/store/account-actions";
import { completeApplePay, placeOrder, startApplePayOrder, validateApplePayMerchant, type PlaceOrderResult } from "@/lib/store/actions";
import {
  EMPTY_ADDRESS,
  EMPTY_IDENTITY,
  formatCep,
  formatCpf,
  formatPhoneInput,
  normalizeBrPhone,
  normalizeCpf,
  splitFullName,
  validateAddress,
  validateIdentity,
  type AddressField,
  type CardSelection,
  type CheckoutAddress,
  type CheckoutIdentity,
  type IdentityField,
  type PayMethod,
} from "@/lib/store/checkout-data";
import { attemptFor, clearDraft, EMPTY_DRAFT, readDraft, saveDraft, stepFromUrl, type CheckoutDraft, type CheckoutStep } from "@/lib/store/checkout-draft";
import { forgetDeviceCustomer } from "@/lib/store/customer";
import { quoteShipping } from "@/lib/store/shipping-actions";
import { clearCoupon, saveCoupon, savedCoupon } from "@/lib/store/welcome";
import type { DeliveryZone } from "@/lib/types";
import { useCart } from "../cart-context";
import { useCartRefresh } from "../cart-lines";
import { EmptyState } from "../section";
import { useStoreConfig } from "../store-config";
import { ApplePayButton, startApplePaySession, useApplePayAvailable } from "./apple-pay";
import type { CardBrickHandle } from "./card-brick";
import { DeliverySection } from "./delivery-section";
import { IdentitySection } from "./identity-section";
import { OrderSummary } from "./order-summary";
import { PaymentSection } from "./payment-section";
import { ReviewSection } from "./review-section";
import { CheckoutSteps } from "./steps";
import { SESSION_CHANGED } from "../auth/account-menu";
import { ConfirmEmail } from "../auth/confirm-email";
import { LoginForm } from "../auth/login-form";

const LAST_ORDER_KEY = "mivora.lastOrder";
/** Long labels wrap on narrow phones instead of widening the page */
const STEP_BUTTON = "w-full whitespace-normal px-5 text-center sm:w-auto sm:px-8";
type LastOrder = { code: string; url: string; summarized: boolean; at: number };

const LOGIN_NOTICE: Record<string, { tone: "info" | "error"; text: string }> = {
  ok: { tone: "info", text: "Pronto, você entrou na sua conta. Sua sacola foi mantida." },
  confirmado: { tone: "info", text: "E-mail confirmado! Sua conta está ativa e sua sacola foi mantida." },
  cancelado: { tone: "info", text: "O login foi cancelado. Você pode tentar de novo ou entrar com seu e-mail." },
  erro: { tone: "error", text: "Não foi possível entrar agora. Tente de novo." },
};
const CHECKOUT_URL = "/finalizar?etapa=identificacao";

function sameIdentity(a: CheckoutIdentity, account: Account) {
  return (
    a.firstName.trim() === (account.firstName ?? "") &&
    a.lastName.trim() === (account.lastName ?? "") &&
    normalizeBrPhone(a.phone) === account.phone &&
    normalizeCpf(a.cpf) === (account.cpf ?? "") &&
    a.marketing === account.marketing
  );
}

function focusFirstError() {
  setTimeout(() => {
    const el = document.querySelector<HTMLElement>('[aria-invalid="true"], [data-error="true"]');
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.focus({ preventScroll: true });
  }, 0);
}

export function CheckoutFlow({
  zones,
  calculatorEnabled,
  pickupDetails,
  minimumOrderCents,
}: {
  zones: DeliveryZone[];
  calculatorEnabled: boolean;
  pickupDetails: string | null;
  minimumOrderCents: number | null;
}) {
  const { lines, totals, hydrated, clear } = useCart();
  const { whatsappNumber, welcomeOffer, onlinePayment, applePay, cardPayments, mercadoPagoPublicKey, maxInstallments } = useStoreConfig();
  useCartRefresh(true);
  const applePayAvailable = useApplePayAvailable(applePay && onlinePayment);

  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState<CheckoutDraft>(EMPTY_DRAFT);
  const [step, setStep] = useState<CheckoutStep>("identificacao");
  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  const [editingIdentity, setEditingIdentity] = useState(false);
  const [notice, setNotice] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const [identityErrors, setIdentityErrors] = useState<Partial<Record<IdentityField, string>>>({});
  const [addressErrors, setAddressErrors] = useState<Partial<Record<AddressField, string>>>({});
  const [optionError, setOptionError] = useState<string | null>(null);
  const [quote, setQuote] = useState<ShippingQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [card, setCard] = useState<CardSelection | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [coupon, setCoupon] = useState("");
  const [done, setDone] = useState<LastOrder | null>(null);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [placing, startPlacing] = useTransition();
  const [applePayBusy, setApplePayBusy] = useState(false);
  const brickRef = useRef<CardBrickHandle>(null);
  const quoteRequest = useRef(0);
  const quotedCep = useRef<string | null>(null);
  const requestedCep = useRef<string | null>(null);

  const itemRefs = totals.purchasableLines.map((l) => ({ productId: l.productId, variantId: l.variantId, kitId: l.kitId, quantity: l.quantity }));
  const itemsKey = JSON.stringify(itemRefs);

  // ------------------------------------------------------------------ restore (refresh, return from sign-in)
  useEffect(() => {
    let d = readDraft();
    forgetDeviceCustomer();
    if (!d.address.cep) {
      try {
        const cep = normalizeCep(localStorage.getItem("mivora.cep"));
        if (cep) d = { ...d, address: { ...d.address, cep: formatCep(cep) } };
      } catch {
        /* private mode */
      }
    }
    try {
      const last = JSON.parse(sessionStorage.getItem(LAST_ORDER_KEY) ?? "null") as LastOrder | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (last && Date.now() - last.at < 30 * 60 * 1000) setDone(last);
    } catch {
      /* ignore */
    }
    const login = new URL(window.location.href).searchParams.get("login");
    if (login && LOGIN_NOTICE[login]) setNotice(LOGIN_NOTICE[login]);
    setDraft(d);
    setStep(stepFromUrl());
    const saved = savedCoupon();
    if (welcomeOffer && saved && saved.toUpperCase() === welcomeOffer.code) setCoupon(welcomeOffer.code);
    setReady(true);
  }, [welcomeOffer]);

  useEffect(() => {
    if (ready) saveDraft(draft);
  }, [draft, ready]);

  useEffect(() => {
    const onPop = () => setStep(stepFromUrl());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // ------------------------------------------------------------------ account (Supabase session, checked on the server)
  useEffect(() => {
    let cancelled = false;
    getMyAccount()
      .catch(() => null)
      .then((a) => {
        if (cancelled) return;
        setAccount(a);
        if (!a) return;
        setDraft((d) => {
          const [pFirst, pLast] = splitFullName(a.providerName);
          const identity: CheckoutIdentity = {
            email: a.email,
            firstName: a.firstName ?? (d.identity.firstName || pFirst),
            lastName: a.lastName ?? (d.identity.lastName || pLast),
            phone: a.phone ? formatPhoneInput(a.phone) : d.identity.phone,
            cpf: a.cpf ? formatCpf(a.cpf) : d.identity.cpf,
            marketing: a.saved ? a.marketing : d.identity.marketing,
          };
          const preferred = a.addresses.find((x) => x.id === d.addressId) ?? (d.address.number ? null : (a.addresses.find((x) => x.isDefault) ?? a.addresses[0] ?? null));
          return preferred ? { ...d, identity, addressId: preferred.id, address: addressFrom(preferred) } : { ...d, identity };
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ------------------------------------------------------------------ shipping quote (CEP → address + options)
  const lookup = (cepInput: string, keepAddress = false) => {
      const cep = normalizeCep(cepInput);
      if (!cep) {
        setQuoteError("Digite um CEP válido, com 8 números.");
        return;
      }
      const id = ++quoteRequest.current;
      requestedCep.current = cep;
      setQuoting(true);
      setQuoteError(null);
      quoteShipping({ cep, items: JSON.parse(itemsKey) })
        .then((r) => {
          if (id !== quoteRequest.current) return;
          setQuoting(false);
          if (!r.ok) {
            setQuote(null);
            setQuoteError(r.error);
            return;
          }
          const changedCep = quotedCep.current !== cep;
          quotedCep.current = cep;
          setQuote(r.quote);
          try {
            localStorage.setItem("mivora.cep", cep);
          } catch {
            /* private mode */
          }
          const found = r.quote.address;
          setDraft((d) => {
            const address =
              found && !keepAddress
                ? {
                    ...d.address,
                    street: changedCep ? (found.street ?? "") : d.address.street || (found.street ?? ""),
                    district: changedCep ? (found.district ?? "") : d.address.district || (found.district ?? ""),
                    city: found.city ?? d.address.city,
                    uf: found.uf ?? d.address.uf,
                  }
                : d.address;
            const choosable = r.quote.options.filter((o) => !o.unavailableReason);
            const real = choosable.filter((o) => o.kind !== "arrange");
            const keep = choosable.some((o) => o.id === d.shippingOptionId);
            const fromCart = cartChoice(cep);
            const preferred = keep ? d.shippingOptionId : fromCart && choosable.some((o) => o.id === fromCart) ? fromCart : real.length === 1 ? real[0].id : choosable.length === 1 ? choosable[0].id : null;
            return { ...d, address, shippingOptionId: preferred };
          });
          setOptionError(null);
        })
        .catch(() => {
          if (id !== quoteRequest.current) return;
          setQuoting(false);
          setQuoteError("Não foi possível calcular o frete agora. Tente novamente em instantes.");
        });
  };
  const lookupRef = useRef(lookup);
  useEffect(() => {
    lookupRef.current = lookup;
  });

  // quote a CEP that arrived without typing (remembered, restored draft, account's saved address) and again when quantities change
  const lastItems = useRef<string | null>(null);
  const hasStreet = Boolean(draft.address.street);
  useEffect(() => {
    if (!ready || !calculatorEnabled || !hydrated || totals.purchasableLines.length === 0) return;
    const itemsChanged = lastItems.current !== null && lastItems.current !== itemsKey;
    lastItems.current = itemsKey;
    const cep = normalizeCep(draft.address.cep);
    if (!cep) return;
    if (itemsChanged) lookupRef.current(cep, true);
    else if (cep !== requestedCep.current) lookupRef.current(cep, hasStreet);
  }, [ready, calculatorEnabled, hydrated, itemsKey, draft.address.cep, hasStreet, totals.purchasableLines.length]);

  // ------------------------------------------------------------------ derived values
  const option: ShippingOption | null = calculatorEnabled ? (quote?.options.find((o) => o.id === draft.shippingOptionId && !o.unavailableReason) ?? null) : null;
  // a single delivery option needs no choice
  const zone = !calculatorEnabled ? (zones.find((z) => z.id === draft.zoneId) ?? (zones.length === 1 ? zones[0] : null)) : null;
  const zoneCalc = deliveryQuote(zone ? { feeCents: zone.fee_cents, freeOverCents: zone.free_over_cents, minOrderCents: zone.min_order_cents } : null, totals);
  const method = option?.method ?? zone?.method ?? null;
  const needsAddress = method === "shipping" || method === "local_delivery";
  const deliveryFeeCents = option ? (option.method !== "to_arrange" ? option.feeCents : null) : zone && zone.method !== "to_arrange" ? zoneCalc.feeCents : null;
  const discountCents = coupon && welcomeOffer ? Math.floor((totals.subtotalCents * welcomeOffer.percent) / 100) : 0;
  const totalCents = deliveryFeeCents != null && !totals.hasUnpricedItems ? totals.subtotalCents - discountCents + deliveryFeeCents : null;
  const allUnpriced = totals.purchasableLines.length > 0 && totals.purchasableLines.every((l) => l.unitPriceCents == null);
  const belowStoreMinimum = minimumOrderCents != null && !totals.hasUnpricedItems && totals.subtotalCents < minimumOrderCents;
  const zoneBelowMinimum = !calculatorEnabled && zoneCalc.belowMinimum;
  const onlineBlocker = !onlinePayment
    ? null
    : totals.hasUnpricedItems
      ? "Há itens com preço sob consulta na sacola: para eles, o pagamento é combinado pelo WhatsApp."
      : deliveryFeeCents == null
        ? "Para pagar pelo site, escolha uma entrega com valor definido."
        : null;
  const available: Record<PayMethod, boolean> = {
    pix: onlinePayment && !onlineBlocker,
    card: cardPayments && Boolean(mercadoPagoPublicKey) && !onlineBlocker,
    applepay: applePayAvailable && !onlineBlocker,
    checkout_pro: onlinePayment && !onlineBlocker,
    whatsapp: Boolean(whatsappNumber),
  };
  const payMethod: PayMethod | null = draft.payMethod && available[draft.payMethod] ? draft.payMethod : null;
  // before a method is chosen, the summary follows what the store offers (online when available)
  const paysOnSite = payMethod ? payMethod !== "whatsapp" : onlinePayment && !onlineBlocker;
  const deliveryName = option ? option.name : zone ? zone.name : null;
  const deliveryText = deliveryFeeCents == null ? (calculatorEnabled && quote && !option ? "Escolha uma opção" : "A combinar") : deliveryFeeCents === 0 ? "Grátis" : formatBRL(deliveryFeeCents);
  const identityComplete = Object.keys(validateIdentity(draft.identity)).length === 0;
  const signature = JSON.stringify({
    items: itemRefs,
    identity: draft.identity,
    address: needsAddress ? draft.address : null,
    option: draft.shippingOptionId,
    zone: draft.zoneId,
    coupon,
    notes: draft.notes,
    kind: payMethod === "whatsapp" ? "whatsapp" : "online",
  });

  const step2Valid = identityComplete && (!needsAddress || Object.keys(validateAddress(draft.address)).length === 0) && (calculatorEnabled ? Boolean(option) : Boolean(zone) || zones.length === 0);

  // a step reached directly (refresh, shared link) only opens when the previous ones are complete
  useEffect(() => {
    if (!ready || account === undefined) return;
    if ((step === "pagamento" || step === "revisao") && !step2Valid && !(calculatorEnabled && draft.address.cep && !quote)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStep("identificacao");
    } else if (step === "revisao" && (!payMethod || (payMethod === "card" && !card))) {
      if (payMethod === "card") setPaymentError("Por segurança, informe os dados do cartão novamente.");
      setStep("pagamento");
    }
  }, [ready, account, step, step2Valid, payMethod, card, calculatorEnabled, draft.address.cep, quote]);

  // the recipient follows the customer's name until it is edited
  const recipientEdited = useRef(false);
  const fullName = `${draft.identity.firstName} ${draft.identity.lastName}`.trim();
  useEffect(() => {
    if (!ready || recipientEdited.current || !fullName || draft.addressId) return;
    setDraft((d) => (d.address.recipient === fullName ? d : { ...d, address: { ...d.address, recipient: fullName } }));
  }, [ready, fullName, draft.addressId]);

  const goTo = useCallback((next: CheckoutStep) => {
    setStep(next);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("etapa", next);
      url.searchParams.delete("login");
      window.history.pushState({ etapa: next }, "", url);
    } catch {
      /* ignore */
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // ------------------------------------------------------------------ handlers
  const updateIdentity = (patch: Partial<CheckoutIdentity>) => {
    setDraft((d) => ({ ...d, identity: { ...d.identity, ...patch } }));
    setIdentityErrors((e) => {
      const next = { ...e };
      for (const k of Object.keys(patch)) delete next[k as IdentityField];
      return next;
    });
  };
  const updateAddress = (patch: Partial<CheckoutAddress>) => {
    if (patch.recipient !== undefined) recipientEdited.current = true;
    setDraft((d) => ({ ...d, address: { ...d.address, ...patch } }));
    setAddressErrors((e) => {
      const next = { ...e };
      for (const k of Object.keys(patch)) delete next[k as AddressField];
      return next;
    });
    if (patch.cep !== undefined) setQuoteError(null);
  };
  const selectSaved = (a: AccountAddress | null) => {
    if (a) {
      setDraft((d) => ({ ...d, addressId: a.id, address: addressFrom(a) }));
      lookup(a.cep, true);
    } else {
      setDraft((d) => ({ ...d, addressId: null, address: { ...EMPTY_ADDRESS, recipient: `${d.identity.firstName} ${d.identity.lastName}`.trim() } }));
      setQuote(null);
      quotedCep.current = null;
      requestedCep.current = null;
    }
    setAddressErrors({});
  };
  const applyCoupon = (code: string) => {
    const normalized = code.trim().toUpperCase();
    if (!normalized) return "Digite o cupom.";
    if (!welcomeOffer || normalized !== welcomeOffer.code) return "Cupom inválido.";
    setCoupon(normalized);
    saveCoupon(normalized);
    return null;
  };
  const removeCoupon = () => {
    setCoupon("");
    clearCoupon();
  };

  const signOut = async () => {
    setSigningOut(true);
    await signOutAccount().catch(() => null);
    setSigningOut(false);
    setAccount(null);
    window.dispatchEvent(new Event(SESSION_CHANGED));
    setEditingIdentity(false);
    // a shared device does not keep the account's data after signing out
    setDraft((d) => ({ ...d, identity: EMPTY_IDENTITY, addressId: null, address: { ...EMPTY_ADDRESS, cep: d.address.cep } }));
    setNotice({ tone: "info", text: "Você saiu da sua conta neste aparelho." });
  };

  const toPayment = async () => {
    const idErrors = validateIdentity(draft.identity);
    let addrErrors: Partial<Record<AddressField, string>> = {};
    let delivery: string | null = null;
    if (calculatorEnabled) {
      if (!quote) addrErrors = { cep: normalizeCep(draft.address.cep) ? "Aguarde o cálculo do frete ou toque em Buscar." : "Informe o CEP para calcular a entrega." };
      else if (!option) delivery = "Escolha uma opção de entrega.";
    } else if (zones.length > 0 && !zone) delivery = "Escolha uma opção de entrega.";
    if (needsAddress) addrErrors = { ...validateAddress(draft.address), ...addrErrors };
    setIdentityErrors(idErrors);
    setAddressErrors(addrErrors);
    setOptionError(delivery);
    if (Object.keys(idErrors).length || Object.keys(addrErrors).length || delivery) {
      if (Object.keys(idErrors).length && account && !editingIdentity) setEditingIdentity(true);
      focusFirstError();
      return;
    }
    if (account) {
      if (!account.saved || !sameIdentity(draft.identity, account)) {
        setSaving(true);
        const saved = await saveMyAccount({ firstName: draft.identity.firstName, lastName: draft.identity.lastName, phone: draft.identity.phone, cpf: draft.identity.cpf, marketing: draft.identity.marketing }).catch(() => ({
          ok: false as const,
          error: "Não foi possível salvar seus dados agora. Tente novamente.",
          expired: false,
          field: undefined,
        }));
        setSaving(false);
        if (!saved.ok) {
          if (saved.expired) {
            setAccount(null);
            window.dispatchEvent(new Event(SESSION_CHANGED));
            setNotice({ tone: "error", text: saved.error });
          } else if (saved.field) {
            setIdentityErrors({ [saved.field]: saved.error });
            setEditingIdentity(true);
            focusFirstError();
          } else setNotice({ tone: "error", text: saved.error });
          return;
        }
        setAccount({ ...account, saved: true, firstName: draft.identity.firstName.trim(), lastName: draft.identity.lastName.trim(), phone: normalizeBrPhone(draft.identity.phone), cpf: normalizeCpf(draft.identity.cpf), marketing: draft.identity.marketing });
      }
      setEditingIdentity(false);
    } else {
      return;
    }
    setNotice(null);
    if (!payMethod) {
      const first = (["pix", "card", "applepay", "checkout_pro", "whatsapp"] as PayMethod[]).find((m) => available[m]) ?? null;
      setDraft((d) => ({ ...d, payMethod: first }));
    }
    goTo("pagamento");
  };

  const toReview = async () => {
    setPaymentError(null);
    if (!payMethod) {
      setPaymentError("Escolha uma forma de pagamento.");
      return;
    }
    if (payMethod === "card") {
      const selected = await brickRef.current?.getCard();
      if (!selected) {
        setPaymentError("Confira os dados do cartão para continuar.");
        return;
      }
      setCard(selected);
    } else setCard(null);
    setConfirmError(null);
    goTo("revisao");
  };

  const buildPayload = () => ({
    items: itemRefs,
    customer: {
      firstName: draft.identity.firstName.trim(),
      lastName: draft.identity.lastName.trim(),
      email: draft.identity.email.trim(),
      phone: draft.identity.phone,
      cpf: normalizeCpf(draft.identity.cpf),
      marketing: draft.identity.marketing,
    },
    address: needsAddress ? draft.address : null,
    customerNotes: draft.notes,
    deliveryZoneId: !calculatorEnabled && zone && zone.method !== "to_arrange" ? zone.id : null,
    shipping: calculatorEnabled && quote && option ? { cep: quote.cep, optionId: option.id } : null,
    couponCode: coupon,
  });

  /** Same attempt id while nothing changes: repeated clicks never create a second order. */
  const currentAttempt = () => {
    const attempt = attemptFor(draft, signature);
    if (attempt.changed) {
      const next = { ...draft, requestId: attempt.requestId, requestSignature: signature };
      setDraft(next);
      saveDraft(next);
    }
    return attempt.requestId;
  };

  const finish = (result: Extract<PlaceOrderResult, { ok: true }>) => {
    if (result.kind === "whatsapp") {
      const order: LastOrder = { code: result.code, url: result.url, summarized: result.summarized, at: timestamp() };
      try {
        sessionStorage.setItem(LAST_ORDER_KEY, JSON.stringify(order));
      } catch {
        /* ignore */
      }
      clear();
      clearCoupon();
      clearDraft();
      setDone(order);
      window.location.assign(result.url);
      return;
    }
    clear();
    clearCoupon();
    clearDraft();
    window.location.assign(result.url);
  };

  const confirm = () => {
    if (placing || !payMethod || payMethod === "applepay") return;
    setConfirmError(null);
    const requestId = currentAttempt();
    const payment =
      payMethod === "card" && card
        ? { method: "card" as const, token: card.token, paymentMethodId: card.paymentMethodId, issuerId: card.issuerId, installments: card.installments }
        : { method: payMethod as "pix" | "checkout_pro" | "whatsapp" };
    if (payment.method === "card" && !card) {
      goTo("pagamento");
      return;
    }
    startPlacing(async () => {
      const result = await placeOrder({
        ...buildPayload(),
        requestId,
        saveAddress: Boolean(account) && !draft.addressId && draft.saveAddress && needsAddress,
        payment,
      }).catch(() => ({ ok: false as const, error: "Não foi possível registrar o pedido agora. Verifique sua conexão e tente de novo.", retryable: true }));
      if (!result.ok) {
        // the session ended or the e-mail is not confirmed: back to the sign-in / confirmation, nothing is lost
        if ("loginRequired" in result && result.loginRequired) {
          setAccount(null);
          window.dispatchEvent(new Event(SESSION_CHANGED));
          setNotice({ tone: "error", text: result.error });
          goTo("identificacao");
          return;
        }
        if ("confirmRequired" in result && result.confirmRequired) {
          setAccount((a) => (a ? { ...a, emailVerified: false } : a));
          return;
        }
        // a refused card token cannot be used again: back to the card form, with the reason
        if ("step" in result && result.step === "pagamento" && payMethod === "card") {
          setCard(null);
          setPaymentError(result.error);
          goTo("pagamento");
          return;
        }
        setConfirmError(result.error);
        return;
      }
      finish(result);
      await new Promise(() => {}); // keep the button busy while the browser leaves
    });
  };

  const payWithApplePay = () => {
    if (totalCents == null || applePayBusy) return;
    setConfirmError(null);
    const requestId = currentAttempt();
    const payload = { ...buildPayload(), requestId };
    setApplePayBusy(true);
    startApplePaySession({
      label: "MIVORA",
      estimateCents: totalCents,
      prepare: () => startApplePayOrder(payload).catch(() => ({ ok: false as const, error: "Não foi possível registrar o pedido agora." })),
      validate: (url) => validateApplePayMerchant(url),
      pay: (order, token) => completeApplePay({ orderId: order.orderId, cpf: normalizeCpf(draft.identity.cpf), token }),
      onDone: (order, outcome) => {
        if (outcome.ok && outcome.status !== "rejected" && outcome.status !== "cancelled") {
          finish({ ok: true, kind: "order", code: order.code, orderId: order.orderId, url: order.orderUrl });
          return;
        }
        setApplePayBusy(false);
        setConfirmError(outcome.ok ? "O pagamento com Apple Pay não foi aprovado. Tente outro cartão ou escolha Pix." : outcome.error);
      },
      onError: (message) => {
        setApplePayBusy(false);
        setConfirmError(message);
      },
      onCancel: () => setApplePayBusy(false),
    });
  };

  // ------------------------------------------------------------------ render
  if (done) return <OrderSent order={done} onNew={() => { sessionStorage.removeItem(LAST_ORDER_KEY); setDone(null); }} />;
  if (!hydrated || !ready) return <div className="h-64 animate-pulse bg-ivory" aria-busy="true" />;
  if (lines.length === 0) {
    return (
      <EmptyState
        title="Sua sacola está vazia"
        description="Adicione produtos para finalizar a compra."
        action={<Link href="/produtos" className={buttonClasses("primary")}>Explorar produtos</Link>}
      />
    );
  }

  const reachable: ("pagamento" | "revisao")[] = step2Valid ? (payMethod && (payMethod !== "card" || card) ? ["pagamento", "revisao"] : ["pagamento"]) : [];
  const blockedByCart = totals.hasUnavailableItems || belowStoreMinimum || zoneBelowMinimum;

  return (
    <div className="space-y-8">
      <CheckoutSteps current={step} reachable={reachable} onSelect={(s) => (s === "identificacao" || s === "pagamento" || s === "revisao") && goTo(s)} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-14">
        <OrderSummary
          className="order-first lg:order-last"
          values={{
            lines,
            subtotalCents: totals.subtotalCents,
            allUnpriced,
            hasUnpricedItems: totals.hasUnpricedItems,
            discountCents,
            coupon,
            deliveryName,
            deliveryText,
            totalCents,
            paysOnSite,
            estimateNote: !paysOnSite && deliveryFeeCents != null,
          }}
          coupon={{ welcomeOffer, onApply: applyCoupon, onRemove: removeCoupon }}
        />

        <div className="min-w-0 space-y-8">
          {blockedByCart ? (
            <div className="border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger" role="alert">
              {totals.hasUnavailableItems ? (
                <>
                  Um ou mais produtos ficaram indisponíveis.{" "}
                  <Link href="/carrinho" className="font-semibold underline">
                    Revisar sacola
                  </Link>
                </>
              ) : belowStoreMinimum ? (
                <>Pedido mínimo: {formatBRL(minimumOrderCents!)}.</>
              ) : (
                <>Pedido mínimo para esta entrega: {formatBRL(zone?.min_order_cents ?? 0)}.</>
              )}
            </div>
          ) : null}

          {account === null ? (
            <CheckoutLoginGate notice={notice} />
          ) : account && !account.emailVerified ? (
            <ConfirmEmail email={account.email} next={CHECKOUT_URL} />
          ) : step === "identificacao" ? (
            <>
              <IdentitySection
                account={account}
                identity={draft.identity}
                onChange={updateIdentity}
                errors={identityErrors}
                editing={editingIdentity}
                complete={identityComplete && Boolean(account?.saved)}
                onEdit={() => setEditingIdentity(true)}
                onSignOut={signOut}
                signingOut={signingOut}
                notice={notice}
              />
              <div className="border-t border-line" />
              <DeliverySection
                account={account}
                address={draft.address}
                onAddress={updateAddress}
                errors={addressErrors}
                addressId={draft.addressId}
                onSelectSaved={selectSaved}
                saveAddress={draft.saveAddress}
                onSaveAddress={(v) => setDraft((d) => ({ ...d, saveAddress: v }))}
                quote={quote}
                quoting={quoting}
                quoteError={quoteError}
                onLookup={(cep) => lookup(cep)}
                optionId={draft.shippingOptionId}
                onOption={(o) => {
                  setDraft((d) => ({ ...d, shippingOptionId: o.id }));
                  setOptionError(null);
                }}
                optionError={optionError}
                calculatorEnabled={calculatorEnabled}
                zones={zones}
                zoneId={zone?.id ?? null}
                onZone={(id) => {
                  setDraft((d) => ({ ...d, zoneId: id }));
                  setOptionError(null);
                }}
                needsAddress={needsAddress}
                pickupDetails={pickupDetails}
              />
              <div className="flex flex-col-reverse gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
                <Link href="/carrinho" className="inline-flex items-center justify-center gap-2 text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
                  <ArrowLeft className="h-4 w-4" /> Voltar para a sacola
                </Link>
                <Button variant="accent" size="lg" className={STEP_BUTTON} onClick={toPayment} disabled={saving || blockedByCart || account === undefined}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Continuar para o pagamento
                </Button>
              </div>
            </>
          ) : null}

          {account?.emailVerified && step === "pagamento" ? (
            <>
              <PaymentSection
                available={available}
                blocker={onlineBlocker}
                value={payMethod}
                onChange={(m) => {
                  setDraft((d) => ({ ...d, payMethod: m }));
                  setPaymentError(null);
                }}
                error={paymentError}
                maxInstallments={maxInstallments}
                card={{ ref: brickRef, publicKey: mercadoPagoPublicKey, amountCents: totalCents, email: draft.identity.email }}
              />
              <div className="flex flex-col-reverse gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
                <button type="button" onClick={() => goTo("identificacao")} className="inline-flex items-center justify-center gap-2 text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
                  <ArrowLeft className="h-4 w-4" /> Voltar para identificação e entrega
                </button>
                <Button variant="accent" size="lg" className={STEP_BUTTON} onClick={toReview} disabled={!payMethod || blockedByCart}>
                  Continuar para a revisão
                </Button>
              </div>
            </>
          ) : null}

          {account?.emailVerified && step === "revisao" && payMethod ? (
            <>
              <ReviewSection
                lines={totals.purchasableLines}
                identity={draft.identity}
                address={needsAddress ? draft.address : null}
                deliveryName={deliveryName}
                deliveryText={deliveryText}
                deliveryEstimate={option?.estimate ?? zone?.estimate ?? null}
                payMethod={payMethod}
                card={card}
                totals={{ subtotalCents: totals.subtotalCents, discountCents, coupon, totalCents }}
                notes={draft.notes}
                onNotes={(notes) => setDraft((d) => ({ ...d, notes }))}
                goTo={(s) => goTo(s)}
              />
              <div className="space-y-3 border-t border-line pt-6">
                {confirmError ? (
                  <div className="border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger" role="alert">
                    {confirmError}{" "}
                    {payMethod === "card" && !card ? (
                      <button type="button" onClick={() => goTo("pagamento")} className="font-semibold underline">
                        Alterar pagamento
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {payMethod === "applepay" ? (
                  <ApplePayButton onClick={payWithApplePay} disabled={applePayBusy || blockedByCart || totalCents == null} />
                ) : (
                  <Button variant="accent" size="lg" className="w-full whitespace-normal px-5 text-center sm:px-8" onClick={confirm} disabled={placing || blockedByCart || (payMethod === "card" && !card)}>
                    {placing ? <Loader2 className="h-4 w-4 animate-spin" /> : payMethod === "whatsapp" ? <WhatsAppIcon className="h-4 w-4" /> : <Lock className="h-4 w-4" strokeWidth={1.75} />}
                    {placing
                      ? "Confirmando o pedido…"
                      : payMethod === "pix"
                        ? "Confirmar e gerar o Pix"
                        : payMethod === "card"
                          ? `Confirmar e pagar${totalCents != null ? ` ${formatBRL(totalCents)}` : ""}`
                          : payMethod === "checkout_pro"
                            ? "Confirmar e ir para o Mercado Pago"
                            : "Confirmar e enviar pelo WhatsApp"}
                  </Button>
                )}
                <p className="text-center text-xs leading-relaxed text-muted">
                  {payMethod === "whatsapp"
                    ? "O pedido é registrado com um código e a conversa com a nossa equipe é aberta no WhatsApp."
                    : "Pagamento processado pelo Mercado Pago. O pedido é confirmado assim que o pagamento é aprovado."}
                </p>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const timestamp = () => Date.now();

/** No guest checkout: buying needs a signed-in account; the bag stays saved in this browser meanwhile. */
function CheckoutLoginGate({ notice }: { notice: { tone: "info" | "error"; text: string } | null }) {
  return (
    <section aria-labelledby="checkout-login" className="border border-line p-5 sm:p-8">
      <h2 id="checkout-login" className="text-lg font-semibold">
        Entre para finalizar sua compra
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        Para comprar na MIVORA é preciso ter uma conta com o e-mail confirmado. Sua sacola continua salva e você volta para cá depois de entrar ou criar a conta.
      </p>
      {notice ? (
        <p className={notice.tone === "error" ? "mt-4 border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger" : "mt-4 border border-rose-ink/20 bg-rose-soft px-4 py-3 text-sm"} role="status">
          {notice.text}
        </p>
      ) : null}
      <div className="mt-6 max-w-md">
        <LoginForm next={CHECKOUT_URL} idPrefix="checkout" />
      </div>
    </section>
  );
}

/** Delivery option picked in the cart for this CEP (same tab). */
function cartChoice(cep: string) {
  try {
    const c = JSON.parse(sessionStorage.getItem("mivora.shippingChoice") ?? "null");
    return c && c.cep === cep && typeof c.id === "string" ? (c.id as string) : null;
  } catch {
    return null;
  }
}

function addressFrom(a: AccountAddress): CheckoutAddress {
  return {
    recipient: a.recipient,
    cep: formatCep(a.cep),
    street: a.street,
    number: a.number,
    complement: a.complement ?? "",
    reference: a.reference ?? "",
    district: a.district,
    city: a.city,
    uf: a.uf,
  };
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
