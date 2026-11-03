"use client";

import { Flame, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setProductBestSeller } from "@/lib/admin/actions/products";
import { cn } from "@/lib/utils";

/** "Mais vendido" switch in the product list: turns the label on the product photo on or off without opening the product. */
export function BestSellerToggle({ productId, productName, initial }: { productId: string; productName: string; initial: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-start">
      <button
        type="button"
        aria-pressed={on}
        aria-label={`Mais vendido: ${productName}`}
        disabled={pending}
        onClick={() => {
          const next = !on;
          setOn(next);
          setError(null);
          start(async () => {
            const res = await setProductBestSeller(productId, next);
            if (!res.ok) {
              setOn(!next);
              setError(res.message ?? "Erro.");
            }
            router.refresh();
          });
        }}
        className={cn(
          "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs font-medium transition disabled:opacity-60",
          on ? "border-accent bg-accent text-paper hover:bg-accent-hover" : "border-line text-muted hover:border-ink/40 hover:text-ink",
        )}
      >
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Flame className="h-3 w-3" strokeWidth={2} aria-hidden="true" />}
        {on ? "Mais vendido" : "Marcar"}
      </button>
      {error ? <span className="mt-1 text-xs text-danger">{error}</span> : null}
    </span>
  );
}
