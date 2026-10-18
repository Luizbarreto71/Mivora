"use client";

import { ArrowRight, Search, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import { lockBodyScroll } from "@/lib/scroll-lock";
import { Price } from "./price";
import { useSearchSuggestions } from "./use-search-suggestions";

const POPULAR = ["Centella", "Vitamina C", "Niacinamida", "Retinal", "Poros", "Pele sensível"];

export function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const { data, loading, empty } = useSearchSuggestions(q);

  useLayoutEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const unlock = lockBodyScroll();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      unlock();
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const submit = (term: string) => {
    if (!term.trim()) return;
    onClose();
    router.push(`/produtos?q=${encodeURIComponent(term.trim())}`);
  };


  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Buscar produtos">
      <div className="absolute inset-0 animate-fade-in bg-ink/30 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div className="relative max-h-dvh animate-fade-in overflow-y-auto bg-paper shadow-[0_24px_60px_-20px_rgba(0,0,0,0.25)]">
        <form
          className="container-page flex h-20 items-center gap-3 border-b border-line"
          onSubmit={(e) => {
            e.preventDefault();
            submit(q);
          }}
          role="search"
        >
          <Search className="h-5 w-5 shrink-0" strokeWidth={1.5} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            placeholder="Buscar por produto, marca, ativo ou necessidade"
            aria-label="Buscar"
            className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted sm:text-lg"
          />
          <button type="button" onClick={onClose} className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full hover:bg-ivory" aria-label="Fechar busca">
            <X className="h-5 w-5" strokeWidth={1.5} />
          </button>
        </form>

        <div className="container-page py-8" aria-live="polite">
          {!data ? (
            <div>
              <p className="eyebrow mb-4">Buscas populares</p>
              <div className="flex flex-wrap gap-2">
                {POPULAR.map((term) => (
                  <button key={term} type="button" onClick={() => submit(term)} className="rounded-full border border-line px-4 py-2 text-sm hover:border-ink">
                    {term}
                  </button>
                ))}
              </div>
            </div>
          ) : empty ? (
            <p className="text-sm text-muted">Nenhum resultado para “{q}”. Tente outro termo, como o nome de um ativo ou da marca.</p>
          ) : (
            <div className="grid gap-10 lg:grid-cols-[1fr_16rem]">
              <div>
                {data.products.length > 0 ? <p className="eyebrow mb-4">Produtos</p> : null}
                <ul className="divide-y divide-line">
                  {data.products.map((p) => (
                    <li key={p.id}>
                      <Link href={`/produtos/${p.slug}`} onClick={onClose} className="flex items-center gap-4 py-3 hover:opacity-80">
                        <span className="relative h-16 w-16 shrink-0 bg-ivory">
                          {p.image ? <Image src={p.image.url} alt="" fill sizes="64px" className="product-photo object-contain p-1.5" /> : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="eyebrow block text-[0.625rem]">{p.brand.name}</span>
                          <span className="line-clamp-2 text-sm">{p.name}</span>
                        </span>
                        <Price priceCents={p.priceCents} compareAtCents={p.compareAtCents} className="hidden text-sm sm:block" />
                      </Link>
                    </li>
                  ))}
                </ul>
                <button type="button" onClick={() => submit(q)} className="mt-5 inline-flex items-center gap-2 text-[0.6875rem] font-semibold uppercase tracking-[0.18em] underline-offset-4 hover:underline">
                  Ver todos os resultados <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="space-y-8">
                {data.brands.length > 0 ? (
                  <div>
                    <p className="eyebrow mb-3">Marcas</p>
                    <ul className="space-y-2 text-sm">
                      {data.brands.map((b) => (
                        <li key={b.slug}>
                          <Link href={`/marcas/${b.slug}`} onClick={onClose} className="hover:underline">
                            {b.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {data.categories.length > 0 ? (
                  <div>
                    <p className="eyebrow mb-3">Categorias</p>
                    <ul className="space-y-2 text-sm">
                      {data.categories.map((c) => (
                        <li key={c.slug}>
                          <Link href={`/categorias/${c.slug}`} onClick={onClose} className="hover:underline">
                            {c.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </div>
          )}
          {loading && !data ? <p className="mt-6 text-xs text-muted">Buscando…</p> : null}
        </div>
      </div>
    </div>
  );
}
