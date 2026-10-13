"use client";

import { ArrowRight, Search } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Price } from "./price";
import { useSearchSuggestions } from "./use-search-suggestions";

/** Search field in the middle of the header (desktop), with live suggestions. */
export function HeaderSearch({ className }: { className?: string }) {
  const router = useRouter();
  const panelId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const { data, loading, empty } = useSearchSuggestions(q);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const submit = (term: string) => {
    if (!term.trim()) return;
    setOpen(false);
    router.push(`/produtos?q=${encodeURIComponent(term.trim())}`);
  };
  const close = () => {
    setOpen(false);
    setQ("");
  };
  const showPanel = open && q.trim().length >= 2 && (data || loading);

  return (
    <div ref={boxRef} className={cn("relative", className)}>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          submit(q);
        }}
      >
        <label className="flex h-10 items-center gap-2.5 rounded-full border border-line bg-paper px-4 transition focus-within:border-ink/50">
          <Search className="h-4 w-4 shrink-0 text-ink/70" strokeWidth={1.75} />
          <span className="sr-only">Buscar produtos</span>
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            placeholder="Buscar produtos, marcas…"
            role="combobox"
            aria-autocomplete="list"
            aria-controls={showPanel ? panelId : undefined}
            aria-expanded={Boolean(showPanel)}
            className="h-full min-w-0 flex-1 bg-transparent text-[0.8125rem] outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
          />
        </label>
      </form>

      {showPanel ? (
        <div id={panelId} className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 animate-fade-in overflow-hidden rounded-lg border border-line bg-paper shadow-[0_24px_48px_-24px_rgba(0,0,0,0.22)]" aria-live="polite">
          {!data ? (
            <p className="px-4 py-4 text-xs text-muted">Buscando…</p>
          ) : empty ? (
            <p className="px-4 py-4 text-sm text-muted">Nenhum resultado para “{q.trim()}”.</p>
          ) : (
            <>
              <ul className="max-h-[22rem] divide-y divide-line overflow-y-auto">
                {data.products.slice(0, 5).map((p) => (
                  <li key={p.id}>
                    <Link href={`/produtos/${p.slug}`} onClick={close} className="flex items-center gap-3 px-4 py-2.5 hover:bg-ivory">
                      <span className="relative h-11 w-11 shrink-0 bg-ivory">
                        {p.image ? <Image src={p.image.url} alt="" fill sizes="44px" className="product-photo object-contain p-1" /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[0.6875rem] text-muted">{p.brand.name}</span>
                        <span className="line-clamp-1 text-[0.8125rem]">{p.name}</span>
                      </span>
                      <Price priceCents={p.priceCents} compareAtCents={p.compareAtCents} className="shrink-0 text-xs" />
                    </Link>
                  </li>
                ))}
              </ul>
              {data.brands.length || data.categories.length ? (
                <div className="flex flex-wrap gap-1.5 border-t border-line px-4 py-3">
                  {data.brands.map((b) => (
                    <Link key={`b-${b.slug}`} href={`/marcas/${b.slug}`} onClick={close} className="rounded-full border border-line px-3 py-1 text-xs hover:border-ink">
                      {b.name}
                    </Link>
                  ))}
                  {data.categories.map((c) => (
                    <Link key={`c-${c.slug}`} href={`/categorias/${c.slug}`} onClick={close} className="rounded-full bg-ivory px-3 py-1 text-xs hover:bg-sand">
                      {c.name}
                    </Link>
                  ))}
                </div>
              ) : null}
              <button type="button" onClick={() => submit(q)} className="flex w-full items-center justify-between border-t border-line px-4 py-3 text-xs font-semibold hover:bg-ivory">
                Ver todos os resultados <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
