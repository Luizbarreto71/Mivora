import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { HomeNeed } from "@/lib/catalog/queries";
import type { ImageRef } from "@/lib/types";
import { cn } from "@/lib/utils";

// soft tints that keep product photos (white background) blending into each tile
const TINTS = ["#EEF2F5", "#F7EFE6", "#F6E4E1", "#EEF1EA", "#F4ECEF"];

/** The category's own photo, otherwise a product photo not used by an earlier tile. */
function pickImages(needs: HomeNeed[]) {
  const used = new Set<string>();
  return needs.map((n) => {
    if (n.categoryImage) return { ...n, image: n.categoryImage as ImageRef | null, fromProduct: false };
    const image = n.productImages.find((i) => !used.has(i.url)) ?? n.productImages[0] ?? null;
    if (image) used.add(image.url);
    return { ...n, image, fromProduct: true };
  });
}

/** "Cuidados para cada necessidade": each tile opens the need's product list. */
export function NeedTiles({ needs: raw }: { needs: HomeNeed[] }) {
  const needs = pickImages(raw);
  return (
    <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:-mx-6 sm:px-6 md:mx-0 md:grid md:grid-cols-5 md:gap-4 md:overflow-visible md:px-0 md:pb-0 [&::-webkit-scrollbar]:hidden">
      {needs.map((n, i) => (
        <li key={n.slug} className="w-[46%] shrink-0 snap-start sm:w-[30%] md:w-auto">
          <Link href={`/categorias/${n.slug}`} className="group flex h-full flex-col">
            <span className="relative block aspect-[4/3] overflow-hidden rounded-card" style={{ backgroundColor: TINTS[i % TINTS.length] }}>
              {n.image ? (
                <Image
                  src={n.image.url}
                  alt=""
                  fill
                  sizes="(min-width: 768px) 18vw, 46vw"
                  className={cn(
                    "transition-transform duration-700 ease-[var(--ease-soft)]",
                    // product photos carry wide white margins: zoom in a little
                    n.fromProduct ? "scale-[1.18] object-contain p-[6%] mix-blend-multiply group-hover:scale-[1.24]" : "object-cover group-hover:scale-[1.05]",
                  )}
                />
              ) : null}
            </span>
            <span className="flex items-center justify-between gap-2 px-0.5 pt-3 text-[0.9375rem] font-medium">
              {n.name}
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-ink/60 transition-transform group-hover:translate-x-0.5 group-hover:text-ink" strokeWidth={1.75} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
