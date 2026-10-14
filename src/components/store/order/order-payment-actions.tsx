"use client";

import { CreditCard, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { payOrder } from "@/lib/store/actions";

/** Opens the Mercado Pago checkout of the order (reused while valid, created again when needed). */
export function PayOrderButton({ orderId, label }: { orderId: string; label: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Button
        size="lg"
        className="w-full"
        data-mp-checkout-cta="checkout-pro"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await payOrder(orderId).catch(() => ({ ok: false as const, error: "Não foi possível abrir o pagamento agora. Tente novamente em instantes." }));
            if (result.ok) window.location.assign(result.url);
            else setError(result.error);
          });
        }}
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" strokeWidth={1.75} />}
        {pending ? "Abrindo o Mercado Pago…" : label}
      </Button>
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** While the payment is being confirmed (Pix, analysis), the page checks again on its own for a few minutes. */
export function PaymentAutoRefresh({ seconds = 8, maxTimes = 40 }: { seconds?: number; maxTimes?: number }) {
  const router = useRouter();
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (count >= maxTimes) return;
    const timer = setTimeout(() => {
      router.refresh();
      setCount((c) => c + 1);
    }, seconds * 1000);
    return () => clearTimeout(timer);
  }, [count, maxTimes, router, seconds]);
  return null;
}
