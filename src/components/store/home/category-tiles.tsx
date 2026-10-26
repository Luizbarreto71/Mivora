import { ArrowUpRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export type CategoryTile = { slug: string; name: string; image: string | null; productCount: number };

/** "Compre por categoria": product types that have products, each shown with one of its own products. */
export function CategoryTiles({ categories }: { categories: CategoryTile[] }) {
  return (
    <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:-mx-6 sm:gap-4 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-6 lg:gap-5 lg:overflow-visible lg:px-0 lg:pb-0 [&::-webkit-scrollbar]:hidden">
      {categories.map((c) => (
        <li key={c.slug} className="w-[42%] shrink-0 snap-start sm:w-[28%] lg:w-auto">
          <Link href={`/categorias/${c.slug}`} className="group block rounded-card">
            <span className="relative block aspect-square overflow-hidden rounded-card bg-card">
              {c.image ? (
                <Image src={c.image} alt="" fill sizes="(min-width: 1024px) 15vw, (min-width: 640px) 28vw, 42vw" className="product-photo zoom-on-hover object-contain p-[14%]" />
              ) : null}
            </span>
            <span className="mt-3 flex items-start justify-between gap-2 px-0.5">
              <span className="min-w-0">
                <span className="block text-[0.9375rem] font-semibold leading-tight tracking-[-0.01em] group-hover:underline group-hover:underline-offset-4">{c.name}</span>
                <span className="mt-1 block text-xs text-muted">
                  {c.productCount} {c.productCount === 1 ? "produto" : "produtos"}
                </span>
              </span>
              <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-muted transition group-hover:text-ink motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:translate-x-0.5" strokeWidth={1.75} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
