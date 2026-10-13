import Image from "next/image";
import Link from "next/link";
import type { Banner, ProductSummary } from "@/lib/types";
import { buttonClasses } from "@/components/ui/button";

const FALLBACK: Banner = {
  id: "default",
  eyebrow: "Skincare coreano e beleza internacional",
  title: "Sua pele, seu ritual.",
  subtitle: "Uma curadoria especial de skincare para transformar seus momentos de autocuidado.",
  cta_label: "Explorar produtos",
  cta_href: "/produtos",
  cta2_label: "Conhecer a MIVORA",
  cta2_href: "/sobre",
  image_desktop_url: null,
  image_mobile_url: null,
  image_alt: null,
};

/**
 * Editorial hero: copy never sits on top of a photo (always legible). When the
 * admin has not uploaded a campaign image, real product photos are composed
 * on an ivory stage instead.
 */
export function Hero({ banner, products }: { banner: Banner | undefined; products: ProductSummary[] }) {
  const b = banner ?? FALLBACK;
  const stage = products.filter((p) => p.image).slice(0, 3);
  return (
    <section className="relative overflow-hidden border-b border-line">
      <div className="grid lg:min-h-[min(46rem,calc(100dvh-8rem))] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)]">
        <div className="order-2 flex items-center bg-paper lg:order-1">
          <div className="w-full px-4 py-14 sm:px-10 sm:py-20 lg:pl-[max(2.5rem,calc((100vw-88rem)/2+2.5rem))] lg:pr-16">
            {b.eyebrow ? <p className="eyebrow mb-6 animate-fade-up">{b.eyebrow}</p> : null}
            <h1 className="heading-display animate-fade-up text-[3.25rem] leading-[0.98] [animation-delay:80ms] sm:text-[4.5rem] xl:text-[5.5rem]">
              {b.title}
            </h1>
            {b.subtitle ? (
              <p className="mt-7 max-w-md animate-fade-up text-base leading-relaxed text-muted [animation-delay:160ms] sm:text-lg">{b.subtitle}</p>
            ) : null}
            <div className="mt-10 flex animate-fade-up flex-col gap-3 [animation-delay:240ms] sm:flex-row">
              {b.cta_label && b.cta_href ? (
                <Link href={b.cta_href} className={buttonClasses("primary", "lg", "sm:min-w-56")}>
                  {b.cta_label}
                </Link>
              ) : null}
              {b.cta2_label && b.cta2_href ? (
                <Link href={b.cta2_href} className={buttonClasses("outline", "lg", "sm:min-w-56")}>
                  {b.cta2_label}
                </Link>
              ) : null}
            </div>
          </div>
        </div>

        <div className="relative order-1 aspect-[4/3.6] bg-ivory sm:aspect-[16/10] lg:order-2 lg:aspect-auto">
          {b.image_desktop_url ? (
            <>
              <Image
                src={b.image_mobile_url ?? b.image_desktop_url}
                alt={b.image_alt ?? ""}
                fill
                preload
                sizes="100vw"
                className="object-cover lg:hidden"
              />
              <Image src={b.image_desktop_url} alt={b.image_alt ?? ""} fill preload sizes="55vw" className="hidden object-cover lg:block" />
            </>
          ) : (
            <ProductStage products={stage} />
          )}
        </div>
      </div>
    </section>
  );
}

function ProductStage({ products }: { products: ProductSummary[] }) {
  const [a, b, c] = products;
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden={products.length === 0}>
      <div className="absolute left-1/2 top-1/2 h-[78%] w-[62%] -translate-x-1/2 -translate-y-1/2 rounded-t-full bg-blush/55" />
      <div className="absolute inset-x-0 bottom-0 h-[16%] bg-sand" />
      {a ? (
        <Image src={a.image!.url} alt={a.image!.alt ?? a.name} width={900} height={900} preload sizes="(min-width:1024px) 30vw, 55vw" className="product-photo absolute bottom-[6%] left-1/2 h-[82%] w-auto -translate-x-1/2 object-contain" />
      ) : null}
      {b ? (
        <Image src={b.image!.url} alt={b.image!.alt ?? b.name} width={700} height={700} sizes="(min-width:1024px) 22vw, 40vw" className="product-photo absolute bottom-[5%] left-[4%] h-[56%] w-auto object-contain" />
      ) : null}
      {c ? (
        <Image src={c.image!.url} alt={c.image!.alt ?? c.name} width={700} height={700} sizes="(min-width:1024px) 22vw, 40vw" className="product-photo absolute bottom-[5%] right-[3%] h-[60%] w-auto object-contain" />
      ) : null}
    </div>
  );
}
