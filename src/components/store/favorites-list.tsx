"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { buttonClasses } from "@/components/ui/button";
import { getFavoriteProducts } from "@/lib/store/actions";
import type { ProductSummary } from "@/lib/types";
import { useCart } from "./cart-context";
import { ProductGrid } from "./product-card";
import { EmptyState } from "./section";

export function FavoritesList() {
  const { favorites, hydrated } = useCart();
  const [products, setProducts] = useState<ProductSummary[] | null>(null);
  const key = favorites.join(",");

  useEffect(() => {
    if (!hydrated) return;
    let active = true;
    getFavoriteProducts(favorites)
      .then((p) => active && setProducts(p))
      .catch(() => active && setProducts([]));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, key]);

  if (!hydrated || products === null) return <div className="h-64 animate-pulse bg-ivory" aria-busy="true" />;

  const visible = products.filter((p) => favorites.includes(p.id));
  if (visible.length === 0) {
    return (
      <EmptyState
        title="Nenhum favorito ainda"
        description="Toque no coração dos produtos para guardá-los aqui."
        action={
          <Link href="/produtos" className={buttonClasses("outline")}>
            Explorar produtos
          </Link>
        }
      />
    );
  }
  return <ProductGrid products={visible} />;
}
