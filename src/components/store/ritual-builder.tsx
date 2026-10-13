"use client";

import { ShoppingBag } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ProductSummary, RitualStep } from "@/lib/types";
import { SKIN_TYPE_LABEL } from "@/lib/types";
import { isIrritatingPair } from "@/lib/catalog/rules";
import { cn } from "@/lib/utils";
import { useCart } from "./cart-context";
import { ProductCard } from "./product-card";
import { cartLineFromProduct } from "./product-actions";

type RitualProduct = ProductSummary & { categorySlugs: string[]; skinTypes: string[]; tags: string[] };

export function RitualBuilder({
  concerns,
  steps,
  products,
}: {
  concerns: { slug: string; name: string; description: string | null }[];
  steps: RitualStep[];
  products: RitualProduct[];
}) {
  const { add } = useCart();
  const [concern, setConcern] = useState<string | null>(null);
  const [skin, setSkin] = useState<string | null>(null);

  const plan = useMemo(() => {
    if (!concern) return [];
    const fits = (p: RitualProduct) => !skin || p.skinTypes.includes(skin) || p.skinTypes.includes("todos") || p.skinTypes.length === 0;
    const picked: RitualProduct[] = [];
    return steps.map((step) => {
      // Only products that can be bought right now, matching the chosen need, without irritating pairings
      const match = step.category
        ? products.find(
            (p) =>
              p.isAvailable &&
              p.categorySlugs.includes(step.category!.slug) &&
              p.categorySlugs.includes(concern) &&
              fits(p) &&
              !picked.some((x) => x.id === p.id || isIrritatingPair(x.tags, p.tags)),
          )
        : undefined;
      if (match) picked.push(match);
      return { step, product: match ?? null };
    });
  }, [concern, skin, steps, products]);

  const picked = plan.filter((p) => p.product?.isAvailable).map((p) => p.product!) as ProductSummary[];

  return (
    <div>
      <section>
        <p className="eyebrow mb-4 text-ink">1. Qual é o seu principal objetivo?</p>
        <div className="flex flex-wrap gap-2">
          {concerns.map((c) => (
            <button
              key={c.slug}
              type="button"
              onClick={() => setConcern(c.slug)}
              aria-pressed={concern === c.slug}
              className={cn("min-h-11 rounded-full border px-5 text-sm transition", concern === c.slug ? "border-ink bg-ink text-paper" : "border-line hover:border-ink")}
            >
              {c.name}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <p className="eyebrow mb-4 text-ink">2. Seu tipo de pele (opcional)</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(SKIN_TYPE_LABEL)
            .filter(([k]) => k !== "todos")
            .map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setSkin(skin === k ? null : k)}
                aria-pressed={skin === k}
                className={cn("min-h-11 rounded-full border px-5 text-sm transition", skin === k ? "border-ink bg-ink text-paper" : "border-line hover:border-ink")}
              >
                {label}
              </button>
            ))}
        </div>
      </section>

      {concern ? (
        <section className="mt-16 animate-fade-up" aria-live="polite">
          <div className="flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="eyebrow mb-2">Seu ritual sugerido</p>
              <h2 className="heading-display text-[1.75rem]">{concerns.find((c) => c.slug === concern)?.name}</h2>
            </div>
            {picked.length > 1 ? (
              <Button onClick={() => picked.forEach((p) => add(cartLineFromProduct(p), 1))}>
                <ShoppingBag className="h-4 w-4" /> Adicionar {picked.length} produtos
              </Button>
            ) : null}
          </div>
          <ol className="divide-y divide-line">
            {plan.map(({ step, product }) => (
              <li key={step.id} className="grid gap-6 py-8 md:grid-cols-[14rem_1fr] md:gap-12">
                <div>
                  <span className="heading-display text-[1.75rem] text-muted">{String(step.step_number).padStart(2, "0")}</span>
                  <h3 className="mt-1 font-semibold">{step.title}</h3>
                  {step.description ? <p className="mt-2 text-sm leading-relaxed text-muted">{step.description}</p> : null}
                </div>
                {product ? (
                  <div className="max-w-[16rem]">
                    <ProductCard product={product} />
                  </div>
                ) : (
                  <p className="self-center text-sm text-muted">
                    {step.category ? (
                      <>
                        Sem sugestão específica para este objetivo no momento.{" "}
                        <Link href={`/categorias/${step.category.slug}`} className="underline underline-offset-4">
                          Ver {step.category.name.toLowerCase()}
                        </Link>
                      </>
                    ) : (
                      "Etapa essencial da rotina. Fale com a gente pelo WhatsApp para indicações."
                    )}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </section>
      ) : (
        <p className="mt-16 border border-dashed border-line p-8 text-center text-sm text-muted">Selecione um objetivo para ver o seu ritual sugerido.</p>
      )}
    </div>
  );
}
