"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useId, useImperativeHandle, useRef, useState, type Ref } from "react";
import type { CardSelection } from "@/lib/store/checkout-data";

/** Official Mercado Pago JS SDK (tests point NEXT_PUBLIC_MERCADOPAGO_SDK_URL to a local stand-in). */
const SDK_URL = process.env.NEXT_PUBLIC_MERCADOPAGO_SDK_URL || "https://sdk.mercadopago.com/js/v2";

type BrickController = { getFormData: () => Promise<unknown>; unmount: () => void | Promise<void> };
type MercadoPagoCtor = new (publicKey: string, options?: { locale?: string }) => {
  bricks: () => { create: (name: string, containerId: string, settings: unknown) => Promise<BrickController> };
};
declare global {
  interface Window {
    MercadoPago?: MercadoPagoCtor;
  }
}

let sdkPromise: Promise<void> | null = null;
function loadSdk() {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.MercadoPago) return Promise.resolve();
  sdkPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SDK_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      sdkPromise = null;
      reject(new Error("sdk"));
    };
    document.head.appendChild(script);
  });
  return sdkPromise;
}

type FormData = {
  token?: string;
  payment_method_id?: string;
  issuer_id?: string | number | null;
  installments?: number | string;
  payment_type_id?: string;
};

export type CardBrickHandle = { getCard: () => Promise<CardSelection | null> };

/**
 * Mercado Pago's Card Payment Brick: card number, expiry, security code and installments are typed inside
 * Mercado Pago's secure fields and become a single-use token. Card data never reaches the store.
 */
export function CardBrick({
  ref,
  publicKey,
  amountCents,
  email,
  maxInstallments,
}: {
  ref: Ref<CardBrickHandle>;
  publicKey: string;
  amountCents: number;
  email: string;
  maxInstallments: number;
}) {
  const containerId = `cardBrick_${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const controller = useRef<BrickController | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState("loading");
    loadSdk()
      .then(async () => {
        if (cancelled || !window.MercadoPago) return;
        const mp = new window.MercadoPago(publicKey, { locale: "pt-BR" });
        const created = await mp.bricks().create("cardPayment", containerId, {
          initialization: { amount: Math.round(amountCents) / 100, payer: { email } },
          customization: {
            visual: {
              hidePaymentButton: true,
              style: {
                theme: "default",
                customVariables: { baseColor: "#121212", textPrimaryColor: "#121212", borderRadiusMedium: "2px", borderRadiusSmall: "2px", formBackgroundColor: "#ffffff" },
              },
            },
            paymentMethods: { maxInstallments: Math.min(Math.max(maxInstallments, 1), 12), types: { excluded: ["debit_card"] } },
          },
          callbacks: {
            onReady: () => !cancelled && setState("ready"),
            onSubmit: async () => undefined,
            onError: (error: unknown) => console.warn("[cartão] Mercado Pago", error),
          },
        });
        if (cancelled) await created.unmount();
        else controller.current = created;
      })
      .catch(() => !cancelled && setState("error"));
    return () => {
      cancelled = true;
      const current = controller.current;
      controller.current = null;
      void current?.unmount();
    };
  }, [publicKey, amountCents, email, maxInstallments, containerId]);

  useImperativeHandle(ref, () => ({
    getCard: async () => {
      if (!controller.current) return null;
      try {
        const raw = (await controller.current.getFormData()) as { formData?: FormData; additionalData?: { lastFourDigits?: string; paymentTypeId?: string } } & FormData;
        const data: FormData = raw?.formData ?? raw;
        if (!data?.token || !data.payment_method_id) return null;
        return {
          token: data.token,
          paymentMethodId: data.payment_method_id,
          issuerId: data.issuer_id != null ? String(data.issuer_id) : null,
          installments: Number(data.installments) || 1,
          paymentType: raw?.additionalData?.paymentTypeId ?? data.payment_type_id ?? "credit_card",
          lastFour: raw?.additionalData?.lastFourDigits ?? null,
        };
      } catch {
        return null;
      }
    },
  }));

  return (
    <div className="mt-4">
      {state === "loading" ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando o formulário seguro do Mercado Pago…
        </p>
      ) : null}
      {state === "error" ? (
        <p className="text-sm text-danger" role="alert">
          Não foi possível carregar o pagamento com cartão agora. Recarregue a página ou escolha Pix.
        </p>
      ) : null}
      <div id={containerId} />
    </div>
  );
}
