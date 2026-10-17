import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { ProductGrid } from "@/components/store/product-card";
import { EmptyState } from "@/components/store/section";
import { buttonClasses } from "@/components/ui/button";
import { catalogQueryString, parseCatalogParams, type CatalogFilters } from "@/lib/catalog/filters";
import { getBrands, getCategories, listProducts, type CategoryWithCount } from "@/lib/catalog/queries";
import { CatalogToolbar, FilterPanel, type FilterOptions } from "./catalog-filters";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Server-rendered, URL-driven catalogue. `fixed` filters come from the route
 * (brand page, category page, collections) and are merged on the server.
 */
export async function CatalogView({
  basePath,
  searchParams,
  fixed = {},
  emptyTitle = "Nenhum produto encontrado",
  emptyDescription = "Ajuste os filtros ou explore o catálogo completo.",
}: {
  basePath: string;
  searchParams: Promise<SearchParams>;
  fixed?: CatalogFilters;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const user = parseCatalogParams(await searchParams);
  const query: CatalogFilters = {
    ...user,
    ...fixed,
    marca: fixed.marca ?? user.marca,
    categoria: fixed.categoria ?? user.categoria,
    necessidade: fixed.necessidade ?? user.necessidade,
  };

  const [page, brands, categories, priced] = await Promise.all([
    listProducts(query),
    getBrands(),
    getCategories(),
    listProducts({ ...fixed, min: 0 }, 1),
  ]);

  const options: FilterOptions = {
    brands: brands.filter((b) => b.productCount > 0).map((b) => ({ slug: b.slug, name: b.name, count: b.productCount })),
    productTypes: categoryTree(categories.filter((c) => c.kind === "product_type" && c.productCount > 0)),
    concerns: categories.filter((c) => c.kind === "concern" && c.productCount > 0).map((c) => ({ slug: c.slug, name: c.name, count: c.productCount })),
    hasPrices: priced.total > 0,
  };
  const locked = { marca: Boolean(fixed.marca), categoria: Boolean(fixed.categoria), necessidade: Boolean(fixed.necessidade) };

  return (
    <div className="grid gap-10 lg:grid-cols-[15rem_1fr] lg:gap-14">
      <aside className="hidden lg:block" aria-label="Filtros">
        <div className="sticky top-36">
          <FilterPanel basePath={basePath} filters={user} options={options} locked={locked} />
        </div>
      </aside>
      <div className="min-w-0">
        <h2 className="sr-only">Produtos</h2>
        <CatalogToolbar basePath={basePath} filters={user} options={options} locked={locked} total={page.total} />
        <div className="pt-8">
          {page.items.length === 0 ? (
            <EmptyState
              title={emptyTitle}
              description={emptyDescription}
              action={
                <Link href="/produtos" className={buttonClasses("outline")}>
                  Ver todos os produtos
                </Link>
              }
            />
          ) : (
            <ProductGrid products={page.items} priorityCount={4} />
          )}
        </div>
        {page.pageCount > 1 ? <Pagination basePath={basePath} filters={user} page={page.page} pageCount={page.pageCount} /> : null}
      </div>
    </div>
  );
}

/** Parents followed by their subcategories, for indented filter lists. */
function categoryTree(list: CategoryWithCount[]) {
  const roots = list.filter((c) => !c.parent_id || !list.some((p) => p.id === c.parent_id));
  return roots.flatMap((r) => [
    { slug: r.slug, name: r.name, count: r.productCount, depth: 0 },
    ...list.filter((c) => c.parent_id === r.id).map((c) => ({ slug: c.slug, name: c.name, count: c.productCount, depth: 1 })),
  ]);
}

function Pagination({ basePath, filters, page, pageCount }: { basePath: string; filters: CatalogFilters; page: number; pageCount: number }) {
  const href = (p: number) => `${basePath}${catalogQueryString({ ...filters, pagina: p })}`;
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1).filter((p) => p === 1 || p === pageCount || Math.abs(p - page) <= 1);
  return (
    <nav aria-label="Paginação" className="mt-16 flex items-center justify-center gap-1">
      {page > 1 ? (
        <Link href={href(page - 1)} className="flex h-10 w-10 items-center justify-center hover:bg-ivory" aria-label="Página anterior">
          <ChevronLeft className="h-4 w-4" />
        </Link>
      ) : null}
      {pages.map((p, i) => (
        <span key={p} className="flex items-center">
          {i > 0 && p - pages[i - 1] > 1 ? <span className="px-1 text-muted">…</span> : null}
          <Link
            href={href(p)}
            aria-current={p === page ? "page" : undefined}
            className={p === page ? "flex h-10 min-w-10 items-center justify-center rounded-full bg-ink px-3 text-sm text-paper" : "flex h-10 min-w-10 items-center justify-center rounded-full px-3 text-sm hover:bg-ivory"}
          >
            {p}
          </Link>
        </span>
      ))}
      {page < pageCount ? (
        <Link href={href(page + 1)} className="flex h-10 w-10 items-center justify-center hover:bg-ivory" aria-label="Próxima página">
          <ChevronRight className="h-4 w-4" />
        </Link>
      ) : null}
    </nav>
  );
}

/** Loading state of category and brand pages: the title band keeps its place, so nothing jumps when it arrives. */
export function CatalogPageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Carregando produtos">
      <div className="bg-ivory">
        <div className="container-page py-10 sm:py-14">
          <div className="mb-8 h-4 w-48 animate-pulse rounded bg-sand" />
          <div className="mb-3 h-3 w-28 animate-pulse rounded bg-sand" />
          <div className="h-10 w-72 max-w-full animate-pulse rounded bg-sand sm:h-[3.25rem]" />
          <div className="mt-3 h-5 w-24 animate-pulse rounded bg-sand" />
          <div className="mt-4 h-7 w-full max-w-xl animate-pulse rounded bg-sand" />
          <div className="mt-8 flex flex-wrap gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-10 w-36 animate-pulse rounded-full bg-sand" />
            ))}
          </div>
        </div>
      </div>
      <div className="container-page py-10 sm:py-14">
        <CatalogSkeleton />
      </div>
    </div>
  );
}

export function CatalogSkeleton() {
  return (
    <div className="grid gap-10 lg:grid-cols-[15rem_1fr] lg:gap-14" aria-busy="true" aria-label="Carregando produtos">
      <div className="hidden space-y-4 lg:block">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-5 animate-pulse bg-ivory" />
        ))}
      </div>
      <div>
        <div className="h-10 border-b border-line" />
        <div className="grid grid-cols-2 gap-x-3 gap-y-10 pt-8 sm:gap-x-5 md:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i}>
              <div className="aspect-square animate-pulse rounded-card bg-ivory" />
              <div className="mt-4 h-3 w-1/3 animate-pulse bg-ivory" />
              <div className="mt-2 h-4 w-4/5 animate-pulse bg-ivory" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
