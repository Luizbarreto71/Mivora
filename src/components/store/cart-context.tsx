"use client";

import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { clampQuantity, computeTotals, type CartLine, type CartTotals } from "@/lib/cart/math";
import { trackCartAdd } from "@/lib/store/actions";

const CART_KEY = "mivora.cart.v1";
const FAVORITES_KEY = "mivora.favorites.v1";

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable (private mode / quota): the cart still works for this visit
  }
}

function sanitizeLines(value: unknown): CartLine[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((l): l is CartLine => Boolean(l && typeof l === "object" && typeof (l as CartLine).key === "string" && typeof (l as CartLine).name === "string"))
    .map((l) => ({ ...l, quantity: clampQuantity(Number(l.quantity), l.maxQuantity ?? null) }))
    .slice(0, 60);
}

type CartContextValue = {
  lines: CartLine[];
  totals: CartTotals;
  hydrated: boolean;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  add: (line: Omit<CartLine, "quantity">, quantity?: number) => void;
  setQuantity: (key: string, quantity: number) => void;
  remove: (key: string) => void;
  clear: () => void;
  applyUpdates: (updates: { key: string; exists: boolean; name?: string; unitPriceCents?: number | null; maxQuantity?: number | null; isAvailable?: boolean; imageUrl?: string | null }[]) => void;
  favorites: string[];
  toggleFavorite: (productId: string) => void;
  isFavorite: (productId: string) => boolean;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [isOpen, setOpen] = useState(false);

  useEffect(() => {
    // Hydrate from this device's storage after mount (no server rendering mismatch).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLines(sanitizeLines(readJSON(CART_KEY, [])));
    setFavorites(readJSON<string[]>(FAVORITES_KEY, []).filter((x) => typeof x === "string").slice(0, 200));
    setHydrated(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key === CART_KEY) setLines(sanitizeLines(readJSON(CART_KEY, [])));
      if (e.key === FAVORITES_KEY) setFavorites(readJSON<string[]>(FAVORITES_KEY, []));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (hydrated) writeJSON(CART_KEY, lines);
  }, [lines, hydrated]);

  useEffect(() => {
    if (hydrated) writeJSON(FAVORITES_KEY, favorites);
  }, [favorites, hydrated]);

  const add = useCallback<CartContextValue["add"]>((line, quantity = 1) => {
    setLines((current) => {
      const existing = current.find((l) => l.key === line.key);
      if (existing) {
        return current.map((l) =>
          l.key === line.key ? { ...l, ...line, quantity: clampQuantity(l.quantity + quantity, line.maxQuantity) } : l,
        );
      }
      return [...current, { ...line, quantity: clampQuantity(quantity, line.maxQuantity) }];
    });
    setOpen(true);
    if (line.productId && !line.kitId) void trackCartAdd(line.productId).catch(() => undefined);
  }, []);

  const setQuantity = useCallback((key: string, quantity: number) => {
    setLines((current) => current.map((l) => (l.key === key ? { ...l, quantity: clampQuantity(quantity, l.maxQuantity) } : l)));
  }, []);

  const remove = useCallback((key: string) => setLines((current) => current.filter((l) => l.key !== key)), []);
  const clear = useCallback(() => setLines([]), []);

  const applyUpdates = useCallback<CartContextValue["applyUpdates"]>((updates) => {
    setLines((current) =>
      current.map((line) => {
        const u = updates.find((x) => x.key === line.key);
        if (!u) return line;
        if (!u.exists) return { ...line, isAvailable: false };
        const maxQuantity = u.maxQuantity ?? null;
        return {
          ...line,
          name: line.variantName || line.kitId ? line.name : (u.name ?? line.name),
          unitPriceCents: u.unitPriceCents ?? null,
          maxQuantity,
          isAvailable: u.isAvailable ?? line.isAvailable,
          imageUrl: u.imageUrl ?? line.imageUrl,
          quantity: maxQuantity != null && maxQuantity > 0 ? clampQuantity(line.quantity, maxQuantity) : line.quantity,
        };
      }),
    );
  }, []);

  const toggleFavorite = useCallback((productId: string) => {
    setFavorites((current) => (current.includes(productId) ? current.filter((id) => id !== productId) : [productId, ...current].slice(0, 200)));
  }, []);

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      totals: computeTotals(lines),
      hydrated,
      isOpen,
      open: () => setOpen(true),
      close: () => setOpen(false),
      add,
      setQuantity,
      remove,
      clear,
      applyUpdates,
      favorites,
      toggleFavorite,
      isFavorite: (id: string) => favorites.includes(id),
    }),
    [lines, hydrated, isOpen, add, setQuantity, remove, clear, applyUpdates, favorites, toggleFavorite],
  );

  return <CartContext value={value}>{children}</CartContext>;
}

export function useCart() {
  const ctx = use(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
