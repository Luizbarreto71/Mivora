import Image from "next/image";
import Link from "next/link";
import type { BrandWithCount } from "@/lib/catalog/queries";
import { cn } from "@/lib/utils";

/**
 * "Descubra por marca": the brand's own image when the store uploaded one, otherwise a real
 * product photo of the brand. Names are set in the site typeface — never imitation logos.
 */
export function BrandTiles({ brands }: { brands: BrandWithCount[] }) {
  return (
    <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:-mx-6 sm:px-6 md:mx-0 md:grid md:grid-cols-5 md:gap-4 md:overflow-visible md:px-0 md:pb-0 [&::-webkit-scrollbar]:hidden">
      {brands.map((b) => {
        const editorial = Boolean(b.image_url);
        return (
          <li key={b.id} className="w-[44%] shrink-0 snap-start sm:w-[30%] md:w-auto">
            <Link href={`/marcas/${b.slug}`} className="group relative block aspect-[4/3] overflow-hidden rounded-card bg-gradient-to-br from-[#faf8f6] via-[#f4efeb] to-[#ece4de] transition-shadow duration-300 hover:shadow-lift">
              {b.coverImage ? (
                <Image
                  src={b.coverImage}
                  alt=""
                  fill
                  sizes="(min-width: 768px) 18vw, 44vw"
                  className={cn(
                    "transition-transform duration-700 ease-[var(--ease-soft)]",
                    editorial ? "object-cover group-hover:scale-[1.05]" : "origin-[50%_40%] scale-[1.12] object-contain px-[12%] pb-[22%] pt-[3%] mix-blend-multiply group-hover:scale-[1.18]",
                  )}
                />
              ) : null}
              <span
                className={cn(
                  "absolute inset-x-0 bottom-0 px-3 pb-3 pt-10 text-center text-[0.9375rem] font-semibold tracking-tight",
                  editorial ? "bg-gradient-to-t from-ink/55 to-transparent text-paper" : "bg-gradient-to-t from-[#f4efeb] via-[#f4efeb]/85 to-transparent text-ink",
                )}
              >
                {b.name}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
