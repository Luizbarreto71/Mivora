import type { Banner, ProductSummary } from "@/lib/types";
import { HeroCarousel } from "./hero-carousel";

const FALLBACK: Banner = {
  id: "default",
  eyebrow: "Beleza que cuida de você",
  title: "Sua pele, seu ritual.",
  subtitle: "Skincare coreano e cosméticos importados para uma pele mais saudável, bonita e radiante.",
  cta_label: "Explorar produtos",
  cta_href: "/produtos",
  cta2_label: null,
  cta2_href: null,
  image_desktop_url: null,
  image_mobile_url: null,
  image_alt: null,
  background_color: "#F6E4E1",
};

/**
 * Editorial banner: copy never sits on top of a photo (always legible). Every active "hero"
 * banner is a slide, in the admin order. A banner without a campaign photo shows its product
 * (or a featured product) under a soft studio light.
 */
export function Hero({ banners, fallbackProduct }: { banners: Banner[]; fallbackProduct: ProductSummary | null }) {
  const fallback = fallbackProduct?.image ? { slug: fallbackProduct.slug, name: fallbackProduct.name, image: fallbackProduct.image } : null;
  const slides = (banners.length > 0 ? banners : [FALLBACK]).map((b) => (b.image_desktop_url || b.product?.image ? b : { ...b, product: fallback }));
  return <HeroCarousel slides={slides} />;
}
