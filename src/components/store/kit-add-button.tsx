"use client";

import { ShoppingBag } from "lucide-react";
import { useState } from "react";
import { buttonClasses } from "@/components/ui/button";
import { lineKey } from "@/lib/cart/math";
import type { Kit } from "@/lib/types";
import { useCart } from "./cart-context";
import { QuantityStepper } from "./quantity-stepper";

export function KitAddButton({ kit }: { kit: Pick<Kit, "id" | "slug" | "name" | "imageUrl" | "priceCents" | "maxQuantity" | "isAvailable"> }) {
  const { add } = useCart();
  const [quantity, setQuantity] = useState(1);
  if (!kit.isAvailable) return <p className="text-sm text-muted">Kit indisponível no momento.</p>;
  return (
    <div className="flex gap-3">
      <QuantityStepper value={quantity} onChange={setQuantity} max={kit.maxQuantity} />
      <button
        type="button"
        className={buttonClasses("primary", "lg", "flex-1")}
        onClick={() =>
          add(
            {
              key: lineKey({ kitId: kit.id }),
              productId: null,
              variantId: null,
              kitId: kit.id,
              slug: kit.slug,
              href: `/kits/${kit.slug}`,
              name: `Kit ${kit.name}`,
              brand: null,
              variantName: null,
              volume: null,
              imageUrl: kit.imageUrl,
              unitPriceCents: kit.priceCents,
              maxQuantity: kit.maxQuantity,
              isAvailable: kit.isAvailable,
            },
            quantity,
          )
        }
      >
        <ShoppingBag className="h-4 w-4" /> Adicionar kit
      </button>
    </div>
  );
}
