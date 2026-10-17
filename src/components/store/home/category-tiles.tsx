import { ArrowUpRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export type CategoryTile = { slug: string; name: string; image: string; productCount: number };

/** "Compre por categoria": product types that have products, each with its editorial photo. */
export function CategoryTiles({ categories }: { categories: CategoryTile[] }) {
  return (
    <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:-mx-6 sm:gap-4 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-4 lg:gap-5 lg:overflow-visible lg:px-0 lg:pb-0 [&::-webkit-scrollbar]:hidden">
      {categories.map((c) => (
        <li key={c.slug} className="w-[58%] shrink-0 snap-start sm:w-[36%] lg:w-auto">
          <Link href={`/categorias/${c.slug}`} className="group relative block aspect-[4/5] overflow-hidden rounded-card bg-sand lg:aspect-[5/6]">
            <Image src={c.image} alt="" fill sizes="(min-width: 1024px) 22vw, (min-width: 640px) 36vw, 58vw" className="zoom-on-hover object-cover" />
            <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-ink/70 via-ink/20 to-transparent" />
            <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 text-paper sm:p-5">
              <span>
                <span className="block text-[1.0625rem] font-semibold leading-tight tracking-[-0.01em] sm:text-[1.1875rem]">{c.name}</span>
                <span className="mt-1 block text-xs text-paper/80">
                  {c.productCount} {c.productCount === 1 ? "produto" : "produtos"}
                </span>
              </span>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-paper/15 backdrop-blur-sm transition group-hover:bg-paper group-hover:text-ink">
                <ArrowUpRight className="h-4 w-4" strokeWidth={1.75} />
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
