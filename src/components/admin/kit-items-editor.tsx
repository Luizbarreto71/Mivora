"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

type Item = { key: number; productId: string; quantity: number };

export function KitItemsEditor({ products, initial }: { products: { id: string; name: string; status: string }[]; initial: { product_id: string; quantity: number }[] }) {
  const [items, setItems] = useState<Item[]>(initial.map((i, key) => ({ key, productId: i.product_id, quantity: i.quantity })));
  const [next, setNext] = useState(initial.length);
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.key} className="flex items-center gap-2">
          <select
            name="item_product"
            value={item.productId}
            onChange={(e) => setItems((list) => list.map((x) => (x.key === item.key ? { ...x, productId: e.target.value } : x)))}
            className="h-10 min-w-0 flex-1 rounded-md border border-line bg-paper px-2 text-sm"
            required
          >
            <option value="">Selecione um produto…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.status !== "published" ? " (não publicado)" : ""}
              </option>
            ))}
          </select>
          <input
            name="item_quantity"
            type="number"
            min={1}
            max={20}
            value={item.quantity}
            onChange={(e) => setItems((list) => list.map((x) => (x.key === item.key ? { ...x, quantity: Number(e.target.value) } : x)))}
            className="h-10 w-20 rounded-md border border-line px-2 text-sm"
            aria-label="Quantidade"
          />
          <button type="button" onClick={() => setItems((list) => list.filter((x) => x.key !== item.key))} className="flex h-10 w-10 items-center justify-center text-danger" aria-label="Remover item">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => {
          setItems((list) => [...list, { key: next, productId: "", quantity: 1 }]);
          setNext((n) => n + 1);
        }}
        className="flex items-center gap-1.5 text-sm font-medium underline-offset-2 hover:underline"
      >
        <Plus className="h-4 w-4" /> Adicionar produto
      </button>
    </div>
  );
}
