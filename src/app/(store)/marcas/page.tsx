import { ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { EmptyState, PageHeader } from "@/components/store/section";
import { getBrands } from "@/lib/catalog/queries";

export const metadata: Metadata = {
  title: "Marcas",
  description: "Conheça as marcas de skincare selecionadas pela MIVORA: Medicube, SKIN1004, Celimax, Dr. Althea, Numbuzin e outras.",
  alternates: { canonical: "/marcas" },
};

export default async function BrandsPage() {
  const brands = (await getBrands()).filter((b) => b.productCount > 0);
  return (
    <>
      <PageHeader eyebrow="Curadoria" title="Marcas" description="Marcas reconhecidas, escolhidas pela qualidade das fórmulas e pela experiência de uso.">
        <Breadcrumbs items={[{ label: "Marcas" }]} className="mb-8" />
      </PageHeader>
      <div className="container-page py-12 sm:py-16">
        {brands.length === 0 ? (
          <EmptyState title="Marcas em breve" description="Estamos preparando a nossa seleção de marcas." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {brands.map((b) => (
              <Link key={b.id} href={`/marcas/${b.slug}`} className="group grid grid-cols-[7.5rem_1fr] overflow-hidden border border-line hover:border-ink sm:grid-cols-[9rem_1fr]">
                <div className="relative bg-ivory">
                  {b.coverImage ? <Image src={b.coverImage} alt="" fill sizes="144px" className="product-photo object-contain p-3 transition-transform duration-500 group-hover:scale-105" /> : null}
                </div>
                <div className="flex min-h-40 flex-col justify-between p-5">
                  <div>
                    <p className="heading-display text-[1.75rem]">{b.name}</p>
                    {b.tagline ? <p className="mt-1 text-xs leading-relaxed text-muted">{b.tagline}</p> : null}
                  </div>
                  <p className="mt-4 flex items-center justify-between text-[0.6875rem] font-semibold uppercase tracking-[0.18em]">
                    {b.productCount} {b.productCount === 1 ? "produto" : "produtos"}
                    <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
