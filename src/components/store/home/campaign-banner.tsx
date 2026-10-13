import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { buttonClasses } from "@/components/ui/button";
import type { Banner, ImageRef } from "@/lib/types";

/**
 * Wide editorial band of the home (Rotinas de Skincare, Em breve na MIVORA): copy on one side,
 * the campaign photo on the other — or, while there is no photo, real product photos.
 */
export function CampaignBanner({
  banner,
  products = [],
  fallback,
  href,
  labelledBy,
}: {
  banner: Banner;
  products?: { name: string; image: ImageRef }[];
  fallback?: ReactNode;
  /** overrides the banner link (e.g. WhatsApp when there is nothing to list yet) */
  href?: string;
  labelledBy: string;
}) {
  const link = href ?? banner.cta_href;
  const external = link?.startsWith("http");
  return (
    <section aria-labelledby={labelledBy} className="mt-16 sm:mt-20">
      <div className="relative overflow-hidden" style={{ backgroundColor: banner.background_color ?? "#F3ECE4" }}>
        <div className="container-page relative z-10 flex min-h-[15rem] items-center py-10 sm:min-h-[17rem] lg:min-h-[18.5rem]">
          <div className="max-w-[24rem] lg:max-w-[28rem]">
            {banner.eyebrow ? <p className="mb-3 text-[0.6875rem] font-medium uppercase tracking-[0.22em] text-ink/70">{banner.eyebrow}</p> : null}
            <h2 id={labelledBy} className="heading-display text-[1.75rem] sm:text-[2rem]">
              {banner.title}
            </h2>
            {banner.subtitle ? <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink/75">{banner.subtitle}</p> : null}
            {banner.cta_label && link ? (
              external ? (
                <a href={link} target="_blank" rel="noopener noreferrer" className={buttonClasses("primary", "md", "group/cta mt-6 h-11 gap-3 px-6")}>
                  {banner.cta_label} <ArrowRight className="h-4 w-4 transition-transform group-hover/cta:translate-x-0.5" strokeWidth={1.75} />
                </a>
              ) : (
                <Link href={link} className={buttonClasses("primary", "md", "group/cta mt-6 h-11 gap-3 px-6")}>
                  {banner.cta_label} <ArrowRight className="h-4 w-4 transition-transform group-hover/cta:translate-x-0.5" strokeWidth={1.75} />
                </Link>
              )
            ) : null}
          </div>
        </div>
        <div className="relative h-56 sm:h-64 lg:absolute lg:inset-y-0 lg:right-0 lg:h-auto lg:w-[56%]">
          {banner.image_desktop_url ? (
            <div className="absolute inset-0 lg:[mask-image:linear-gradient(to_right,transparent,#000_30%)]">
              <Image src={banner.image_mobile_url ?? banner.image_desktop_url} alt={banner.image_alt ?? ""} fill sizes="100vw" className="object-cover lg:hidden" />
              <Image src={banner.image_desktop_url} alt={banner.image_alt ?? ""} fill sizes="56vw" className="hidden object-cover lg:block" />
            </div>
          ) : products.length > 0 ? (
            <ProductShelf products={products} />
          ) : (
            fallback
          )}
        </div>
      </div>
    </section>
  );
}

/** Real product photos side by side on a soft light, bottom-aligned like a shelf. */
function ProductShelf({ products }: { products: { name: string; image: ImageRef }[] }) {
  const items = products.slice(0, 5);
  // widths keep every product whole on any screen; phones show the first three
  const sizes = ["w-[30%] lg:w-[21%]", "w-[34%] lg:w-[25%]", "w-[31%] lg:w-[23%]", "hidden lg:block lg:w-[19%]", "hidden lg:block lg:w-[21%]"];
  return (
    <div className="absolute inset-0">
      <div
        aria-hidden="true"
        className="absolute inset-x-[6%] bottom-[-30%] top-[8%] rounded-[50%]"
        style={{ background: "radial-gradient(closest-side, rgba(255,255,255,0.95), rgba(255,255,255,0.6) 55%, rgba(255,255,255,0) 100%)" }}
      />
      <div aria-hidden="true" className="absolute inset-x-[12%] bottom-[9%] h-[5%] rounded-[50%] bg-ink/10 blur-xl" />
      <ul className="absolute inset-x-[4%] bottom-[8%] top-[6%] flex items-end justify-center">
        {items.map((p, i) => (
          <li key={p.name} className={`relative -mx-[1.5%] aspect-square max-h-full ${sizes[i]} mix-blend-multiply`} style={{ zIndex: i === 1 || i === 3 ? 2 : 1 }}>
            <Image src={p.image.url} alt={p.name} fill sizes="(min-width: 1024px) 14vw, 30vw" className="object-contain" />
          </li>
        ))}
      </ul>
    </div>
  );
}
