"use client";

import { SlidersHorizontal, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { AVAILABILITY_FILTERS, catalogQueryString, hasActiveFilters, SORT_OPTIONS, type CatalogFilters, type SortValue } from "@/lib/catalog/filters";
import { SKIN_TYPE_LABEL } from "@/lib/types";
import { cn } from "@/lib/utils";

type Option = { slug: string; name: string; count?: number; depth?: number };

export type FilterOptions = {
  brands: Option[];
  productTypes: Option[];
  concerns: Option[];
  hasPrices: boolean;
};

type Props = {
  basePath: string;
  filters: CatalogFilters;
  options: FilterOptions;
  /** Filters fixed by the page (e.g. the brand on a brand page) are not shown. */
  locked?: { marca?: boolean; categoria?: boolean; necessidade?: boolean };
  total: number;
};

function useCatalogNavigation(basePath: string) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const go = (next: CatalogFilters) => startTransition(() => router.push(`${basePath}${catalogQueryString({ ...next, pagina: undefined })}`, { scroll: false }));
  return { go, pending };
}

export function CatalogToolbar({ basePath, filters, options, locked, total }: Props) {
  const { go, pending } = useCatalogNavigation(basePath);
  const [open, setOpen] = useState(false);
  const active = hasActiveFilters({ ...filters, q: undefined });

  return (
    <>
      <div className={cn("flex items-center justify-between gap-4 border-b border-line pb-4 transition-opacity", pending && "opacity-60")}>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex h-10 items-center gap-2 rounded-full border border-line px-4 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] transition-colors hover:border-ink lg:hidden"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.5} /> Filtrar
            {active ? <span className="h-1.5 w-1.5 rounded-full bg-ink" /> : null}
          </button>
          <p className="text-xs text-muted" aria-live="polite">
            {total} {total === 1 ? "produto" : "produtos"}
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <span className="hidden text-muted sm:inline">Ordenar por</span>
          <select
            value={filters.ordem ?? "destaques"}
            onChange={(e) => go({ ...filters, ordem: e.target.value as SortValue })}
            className="h-10 rounded-full border border-line bg-paper px-4 text-xs font-medium focus:border-ink focus:outline-none"
            aria-label="Ordenar produtos"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ActiveFilterChips basePath={basePath} filters={filters} options={options} locked={locked} />
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        side="left"
        title="Filtros"
        footer={
          <Button className="w-full" size="lg" onClick={() => setOpen(false)}>
            Ver {total} {total === 1 ? "produto" : "produtos"}
          </Button>
        }
      >
        <div className="px-5 py-2">
          <FilterPanel basePath={basePath} filters={filters} options={options} locked={locked} />
        </div>
      </Sheet>
    </>
  );
}

function ActiveFilterChips({ basePath, filters, options, locked }: Omit<Props, "total">) {
  const { go } = useCatalogNavigation(basePath);
  const name = (list: Option[], slug: string) => list.find((o) => o.slug === slug)?.name ?? slug;
  const chips: { label: string; next: CatalogFilters }[] = [];
  if (filters.q) chips.push({ label: `Busca: “${filters.q}”`, next: { ...filters, q: undefined } });
  if (!locked?.marca) filters.marca?.forEach((s) => chips.push({ label: name(options.brands, s), next: { ...filters, marca: filters.marca!.filter((x) => x !== s) } }));
  if (!locked?.categoria) filters.categoria?.forEach((s) => chips.push({ label: name(options.productTypes, s), next: { ...filters, categoria: filters.categoria!.filter((x) => x !== s) } }));
  if (!locked?.necessidade) filters.necessidade?.forEach((s) => chips.push({ label: name(options.concerns, s), next: { ...filters, necessidade: filters.necessidade!.filter((x) => x !== s) } }));
  if (filters.pele) chips.push({ label: SKIN_TYPE_LABEL[filters.pele] ?? filters.pele, next: { ...filters, pele: undefined } });
  if (filters.disponibilidade) chips.push({ label: AVAILABILITY_FILTERS.find((a) => a.value === filters.disponibilidade)!.label, next: { ...filters, disponibilidade: undefined } });
  if (filters.novidades) chips.push({ label: "Novidades", next: { ...filters, novidades: undefined } });
  if (filters.min != null || filters.max != null)
    chips.push({ label: `R$ ${filters.min ?? 0} – ${filters.max != null ? `R$ ${filters.max}` : "+"}`, next: { ...filters, min: undefined, max: undefined } });
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 pt-4">
      {chips.map((c) => (
        <button key={c.label} type="button" onClick={() => go(c.next)} className="flex h-8 items-center gap-1.5 rounded-full bg-ivory px-3 text-xs hover:bg-sand">
          {c.label} <X className="h-3 w-3" />
        </button>
      ))}
      <button
        type="button"
        onClick={() => go({ ordem: filters.ordem, ...(locked?.marca ? { marca: filters.marca } : {}), ...(locked?.categoria ? { categoria: filters.categoria } : {}), ...(locked?.necessidade ? { necessidade: filters.necessidade } : {}) })}
        className="ml-1 text-xs text-muted underline underline-offset-2 hover:text-ink"
      >
        Limpar filtros
      </button>
    </div>
  );
}

export function FilterPanel({ basePath, filters, options, locked }: Omit<Props, "total">) {
  const { go, pending } = useCatalogNavigation(basePath);
  const toggle = (key: "marca" | "categoria" | "necessidade", slug: string) => {
    const current = filters[key] ?? [];
    go({ ...filters, [key]: current.includes(slug) ? current.filter((s) => s !== slug) : [...current, slug] });
  };

  return (
    <div className={cn("divide-y divide-line", pending && "opacity-60")}>
      {!locked?.categoria && options.productTypes.length > 0 ? (
        <Group title="Tipo de produto">
          {options.productTypes.map((o) => (
            <CheckRow key={o.slug} label={o.name} count={o.count} depth={o.depth} checked={filters.categoria?.includes(o.slug) ?? false} onChange={() => toggle("categoria", o.slug)} />
          ))}
        </Group>
      ) : null}
      {!locked?.necessidade && options.concerns.length > 0 ? (
        <Group title="Necessidade">
          {options.concerns.map((o) => (
            <CheckRow key={o.slug} label={o.name} count={o.count} checked={filters.necessidade?.includes(o.slug) ?? false} onChange={() => toggle("necessidade", o.slug)} />
          ))}
        </Group>
      ) : null}
      {!locked?.marca && options.brands.length > 0 ? (
        <Group title="Marca">
          {options.brands.map((o) => (
            <CheckRow key={o.slug} label={o.name} count={o.count} checked={filters.marca?.includes(o.slug) ?? false} onChange={() => toggle("marca", o.slug)} />
          ))}
        </Group>
      ) : null}
      <Group title="Tipo de pele">
        {Object.entries(SKIN_TYPE_LABEL)
          .filter(([k]) => k !== "todos")
          .map(([k, label]) => (
            <label key={k} className="flex min-h-9 cursor-pointer items-center gap-2.5 text-sm">
              <input type="radio" name="pele" className="h-4 w-4 accent-ink" checked={filters.pele === k} onChange={() => go({ ...filters, pele: k })} />
              {label}
            </label>
          ))}
        {filters.pele ? (
          <button type="button" className="mt-1 text-xs text-muted underline" onClick={() => go({ ...filters, pele: undefined })}>
            Todos os tipos
          </button>
        ) : null}
      </Group>
      <Group title="Disponibilidade">
        {AVAILABILITY_FILTERS.map((a) => (
          <label key={a.value} className="flex min-h-9 cursor-pointer items-center gap-2.5 text-sm">
            <input type="radio" name="disponibilidade" className="h-4 w-4 accent-ink" checked={filters.disponibilidade === a.value} onChange={() => go({ ...filters, disponibilidade: a.value })} />
            {a.label}
          </label>
        ))}
        {filters.disponibilidade ? (
          <button type="button" className="mt-1 text-xs text-muted underline" onClick={() => go({ ...filters, disponibilidade: undefined })}>
            Mostrar todos
          </button>
        ) : null}
      </Group>
      <Group title="Novidades">
        <CheckRow label="Somente novidades" checked={Boolean(filters.novidades)} onChange={() => go({ ...filters, novidades: filters.novidades ? undefined : true })} />
      </Group>
      {options.hasPrices ? (
        <Group title="Faixa de preço">
          <PriceRange key={`${filters.min}-${filters.max}`} filters={filters} onApply={(min, max) => go({ ...filters, min, max })} />
        </Group>
      ) : null}
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details open className="group py-5 first:pt-0">
      <summary className="flex cursor-pointer list-none items-center justify-between text-[0.6875rem] font-semibold uppercase tracking-[0.18em] [&::-webkit-details-marker]:hidden">
        {title}
        <span className="text-base font-light leading-none group-open:hidden">+</span>
        <span className="hidden text-base font-light leading-none group-open:inline">−</span>
      </summary>
      <div className="mt-4 space-y-1">{children}</div>
    </details>
  );
}

function CheckRow({ label, count, checked, onChange, depth = 0 }: { label: string; count?: number; checked: boolean; onChange: () => void; depth?: number }) {
  return (
    <label className={cn("flex min-h-9 cursor-pointer items-center justify-between gap-3 text-sm", depth > 0 ? "pl-6 text-ink-soft" : "font-medium")}>
      <span className="flex items-center gap-2.5">
        <input type="checkbox" className="h-4 w-4 accent-[var(--color-accent)]" checked={checked} onChange={onChange} />
        {label}
      </span>
      {count != null ? <span className="text-xs tabular-nums text-muted">{count}</span> : null}
    </label>
  );
}

function PriceRange({ filters, onApply }: { filters: CatalogFilters; onApply: (min?: number, max?: number) => void }) {
  const [min, setMin] = useState(filters.min?.toString() ?? "");
  const [max, setMax] = useState(filters.max?.toString() ?? "");
  const parse = (v: string) => (v.trim() === "" ? undefined : Math.max(0, Number(v.replace(",", "."))) || undefined);
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onApply(parse(min), parse(max));
      }}
    >
      <label className="flex-1 text-xs text-muted">
        Mín. (R$)
        <input inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} className="mt-1 h-10 w-full rounded-control border border-line px-2 text-sm text-ink focus:border-ink focus:outline-none" />
      </label>
      <label className="flex-1 text-xs text-muted">
        Máx. (R$)
        <input inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} className="mt-1 h-10 w-full rounded-control border border-line px-2 text-sm text-ink focus:border-ink focus:outline-none" />
      </label>
      <button type="submit" className="h-10 rounded-control border border-ink px-3 text-[0.625rem] font-semibold uppercase tracking-[0.14em] hover:bg-ink hover:text-paper">
        Ok
      </button>
    </form>
  );
}
