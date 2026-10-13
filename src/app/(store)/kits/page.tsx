import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { Price } from "@/components/store/price";
import { EmptyState, PageHeader } from "@/components/store/section";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { getKits } from "@/lib/catalog/queries";

export const metadata: Metadata = {
  title: "Kits e combinações",
  description: "Combinações de skincare montadas pela MIVORA para facilitar a sua rotina.",
  alternates: { canonical: "/kits" },
};

export default async function KitsPage() {
  const kits = await getKits();
  return (
    <>
      <PageHeader eyebrow="Combinações" title="Kits e combinações" description="Produtos que funcionam bem juntos, reunidos para facilitar a sua rotina.">
        <Breadcrumbs items={[{ label: "Kits" }]} className="mb-8" />
      </PageHeader>
      <div className="container-page py-12 sm:py-16">
        {kits.length === 0 ? (
          <EmptyState
            title="Kits em breve"
            description="Estamos preparando combinações especiais. Enquanto isso, monte o seu próprio ritual."
            action={
              <Link href="/ritual" className={buttonClasses("outline")}>
                Monte seu ritual
              </Link>
            }
          />
        ) : (
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {kits.map((k) => (
              <Link key={k.id} href={`/kits/${k.slug}`} className="group">
                <div className="relative aspect-[4/5] overflow-hidden bg-ivory">
                  {k.imageUrl ? <Image src={k.imageUrl} alt="" fill sizes="(min-width:1024px) 30vw, 50vw" className="product-photo object-contain p-[10%] transition-transform duration-700 group-hover:scale-105" /> : null}
                  {!k.isAvailable ? <Badge tone="outline" className="absolute left-3 top-3">Indisponível</Badge> : null}
                </div>
                <p className="eyebrow mt-4 text-[0.625rem]">{k.items.length} produtos</p>
                <h2 className="mt-1 text-base group-hover:underline">{k.name}</h2>
                <Price priceCents={k.priceCents} compareAtCents={k.compareAtCents} className="mt-2" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
