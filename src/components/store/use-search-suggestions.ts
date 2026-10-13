"use client";

import { useEffect, useState } from "react";
import type { ProductSummary } from "@/lib/types";

export type Suggestions = {
  products: ProductSummary[];
  brands: { slug: string; name: string }[];
  categories: { slug: string; name: string }[];
};

/** Debounced suggestions from /api/search (products, brands, categories) for 2+ characters. */
export function useSearchSuggestions(q: string) {
  const [data, setData] = useState<Suggestions | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setData(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: controller.signal });
        if (res.ok) setData(await res.json());
      } catch {
        /* aborted or offline */
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [q]);

  const empty = Boolean(data && !data.products.length && !data.brands.length && !data.categories.length);
  return { data, loading, empty };
}
