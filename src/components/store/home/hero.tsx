import Image from "next/image";
import type { Banner, ProductSummary } from "@/lib/types";
import { HeroCarousel } from "./hero-carousel";

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
 * Editorial hero: copy never sits on top of a photo (always legible). Every active
 * "hero" banner is a slide of the carousel, in the admin order; a banner without a
 * campaign image shows real product photos composed on an ivory stage instead.
 */
export function Hero({ banners, products }: { banners: Banner[]; products: ProductSummary[] }) {
  const slides = banners.length > 0 ? banners : [FALLBACK];
  const stage = products.filter((p) => p.image).slice(0, 3);
  return <HeroCarousel slides={slides} stage={<ProductStage products={stage} preload={!slides[0].image_desktop_url} />} />;
}

function ProductStage({ products, preload }: { products: ProductSummary[]; preload: boolean }) {
  const [a, b, c] = products;
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden={products.length === 0}>
      <div className="absolute left-1/2 top-1/2 h-[78%] w-[62%] -translate-x-1/2 -translate-y-1/2 rounded-t-full bg-blush/55" />
      <div className="absolute inset-x-0 bottom-0 h-[16%] bg-sand" />
      {a ? (
        <Image src={a.image!.url} alt={a.image!.alt ?? a.name} width={900} height={900} preload={preload} sizes="(min-width:1024px) 30vw, 55vw" className="product-photo absolute bottom-[6%] left-1/2 h-[82%] w-auto -translate-x-1/2 object-contain" />
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
