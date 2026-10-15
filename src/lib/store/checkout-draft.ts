"use client";

import { EMPTY_ADDRESS, EMPTY_IDENTITY, type CheckoutAddress, type CheckoutIdentity, type PayMethod } from "./checkout-data";

/**
 * What the customer filled in during the checkout, kept in this tab (sessionStorage) so a refresh or the return
 * from Google / Apple sign-in never loses it. Card data is never stored: it lives only in memory.
 */
export type CheckoutDraft = {
  identity: CheckoutIdentity;
  address: CheckoutAddress;
  addressId: string | null;
  saveAddress: boolean;
  shippingOptionId: string | null;
  zoneId: string | null;
  payMethod: PayMethod | null;
  notes: string;
  /** checkout attempt id and what it was created for */
  requestId: string | null;
  requestSignature: string | null;
};

const KEY = "mivora.checkout.v2";

export const EMPTY_DRAFT: CheckoutDraft = {
  identity: EMPTY_IDENTITY,
  address: EMPTY_ADDRESS,
  addressId: null,
  saveAddress: true,
  shippingOptionId: null,
  zoneId: null,
  payMethod: null,
  notes: "",
  requestId: null,
  requestSignature: null,
};

export function readDraft(): CheckoutDraft {
  try {
    const raw = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
    if (!raw || typeof raw !== "object") return EMPTY_DRAFT;
    return {
      ...EMPTY_DRAFT,
      ...raw,
      identity: { ...EMPTY_IDENTITY, ...(raw.identity ?? {}) },
      address: { ...EMPTY_ADDRESS, ...(raw.address ?? {}) },
    };
  } catch {
    return EMPTY_DRAFT;
  }
}

export function saveDraft(draft: CheckoutDraft) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    /* private mode */
  }
}

export function clearDraft() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Same cart and choices → same attempt id (repeated clicks reuse the order); anything changed → a new one. */
export function attemptFor(draft: CheckoutDraft, signature: string) {
  if (draft.requestId && draft.requestSignature === signature) return { requestId: draft.requestId, changed: false };
  return { requestId: crypto.randomUUID(), changed: true };
}

export type CheckoutStep = "identificacao" | "pagamento" | "revisao";
export const STEPS: CheckoutStep[] = ["identificacao", "pagamento", "revisao"];

export function stepFromUrl(): CheckoutStep {
  try {
    const step = new URL(window.location.href).searchParams.get("etapa");
    return (STEPS as string[]).includes(step ?? "") ? (step as CheckoutStep) : "identificacao";
  } catch {
    return "identificacao";
  }
}
