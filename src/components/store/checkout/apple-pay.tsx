"use client";

import { useEffect, useState } from "react";
import { APPLE_PAY_VERSION, applePayLineItems, applePayPaymentRequest, reaisString, type ApplePayLines } from "@/lib/payments/apple-pay-core";
import { cn } from "@/lib/utils";

export type ApplePayToken = {
  paymentData: Record<string, unknown>;
  transactionIdentifier: string;
  paymentMethod: { network?: string | null; type?: string | null; displayName?: string | null };
};

// Apple Pay JS (Safari) — only the members the checkout uses
interface ApplePaySessionLike {
  onvalidatemerchant: ((event: { validationURL: string }) => void) | null;
  onpaymentmethodselected: ((event: unknown) => void) | null;
  onpaymentauthorized: ((event: { payment: { token: ApplePayToken } }) => void) | null;
  oncancel: ((event: unknown) => void) | null;
  begin(): void;
  abort(): void;
  completeMerchantValidation(merchantSession: unknown): void;
  completePaymentMethodSelection(update: unknown): void;
  completePayment(result: unknown): void;
}
interface ApplePaySessionConstructor {
  new (version: number, request: unknown): ApplePaySessionLike;
  canMakePayments(): boolean;
  supportsVersion(version: number): boolean;
  readonly STATUS_SUCCESS: number;
  readonly STATUS_FAILURE: number;
}
declare global {
  interface Window {
    ApplePaySession?: ApplePaySessionConstructor;
  }
}

/** True on Apple devices whose browser can pay with Apple Pay (checked after hydration). */
export function useApplePayAvailable(enabled: boolean) {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    try {
      const Session = window.ApplePaySession;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (Session && Session.supportsVersion(APPLE_PAY_VERSION) && Session.canMakePayments()) setAvailable(true);
    } catch {
      /* not available */
    }
  }, [enabled]);
  return enabled && available;
}

export type PreparedOrder = { orderId: string; code: string; orderUrl: string; amountCents: number; lines: ApplePayLines };
export type ApplePayOutcome = { ok: true; approved: boolean; status: string } | { ok: false; error: string };

type SessionOptions = {
  label: string;
  /** Total shown when the sheet opens; replaced by the server's total as soon as the order is registered */
  estimateCents: number;
  prepare: () => Promise<({ ok: true } & PreparedOrder) | { ok: false; error: string }>;
  validate: (validationURL: string) => Promise<{ ok: true; session: unknown } | { ok: false; error: string }>;
  pay: (order: PreparedOrder, token: ApplePayToken) => Promise<ApplePayOutcome>;
  onDone: (order: PreparedOrder, outcome: ApplePayOutcome) => void;
  onError: (message: string) => void;
  onCancel: () => void;
};

/**
 * Opens the Apple Pay sheet. Must run synchronously inside the click handler (Apple requires a user gesture).
 * Merchant validation registers the order on the server; the sheet then shows the server's exact total,
 * which is the amount charged.
 */
export function startApplePaySession(opts: SessionOptions) {
  const Session = window.ApplePaySession;
  if (!Session) {
    opts.onError("O Apple Pay não está disponível neste aparelho.");
    return;
  }
  let session: ApplePaySessionLike;
  try {
    session = new Session(APPLE_PAY_VERSION, applePayPaymentRequest(opts.estimateCents, opts.label));
  } catch {
    opts.onError("Não foi possível abrir o Apple Pay neste aparelho.");
    return;
  }
  let order: PreparedOrder | null = null;
  let settled = false;
  const fail = (message: string) => {
    if (settled) return;
    settled = true;
    try {
      session.abort();
    } catch {
      /* already closed */
    }
    opts.onError(message);
  };

  session.onvalidatemerchant = async (event) => {
    try {
      const prepared = await opts.prepare();
      if (!prepared.ok) return fail(prepared.error);
      order = { orderId: prepared.orderId, code: prepared.code, orderUrl: prepared.orderUrl, amountCents: prepared.amountCents, lines: prepared.lines };
      const merchant = await opts.validate(event.validationURL);
      if (!merchant.ok) return fail(merchant.error);
      session.completeMerchantValidation(merchant.session);
    } catch {
      fail("Não foi possível iniciar o Apple Pay agora. Tente novamente ou escolha outra forma de pagamento.");
    }
  };

  session.onpaymentmethodselected = () => {
    const amount = order?.amountCents ?? opts.estimateCents;
    session.completePaymentMethodSelection({
      newTotal: { label: opts.label, amount: reaisString(amount), type: "final" },
      newLineItems: order ? applePayLineItems(order.lines) : [],
    });
  };

  session.onpaymentauthorized = async (event) => {
    const current = order;
    if (!current) return fail("Não foi possível concluir o pagamento com Apple Pay. Tente novamente.");
    let outcome: ApplePayOutcome;
    try {
      outcome = await opts.pay(current, event.payment.token);
    } catch {
      outcome = { ok: false, error: "Não foi possível concluir o pagamento com Apple Pay agora. Tente novamente em instantes." };
    }
    settled = true;
    const accepted = outcome.ok && outcome.status !== "rejected" && outcome.status !== "cancelled";
    try {
      session.completePayment({ status: accepted ? Session.STATUS_SUCCESS : Session.STATUS_FAILURE });
    } catch {
      /* sheet already closed */
    }
    opts.onDone(current, outcome);
  };

  session.oncancel = () => {
    if (settled) return;
    settled = true;
    opts.onCancel();
  };

  session.begin();
}

/** Official Apple Pay button in Safari (CSS appearance); never rendered where Apple Pay is unavailable. */
export function ApplePayButton({ onClick, disabled, className }: { onClick: () => void; disabled?: boolean; className?: string }) {
  return (
    <button type="button" lang="pt-BR" aria-label="Pagar com Apple Pay" onClick={onClick} disabled={disabled} className={cn("apple-pay-button w-full disabled:cursor-not-allowed disabled:opacity-50", className)}>
      <span>Pagar com Apple Pay</span>
    </button>
  );
}
