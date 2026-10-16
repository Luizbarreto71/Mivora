import Image from "next/image";
import type { Banner } from "@/lib/types";
import { cn } from "@/lib/utils";

const CHIPS = [
  { label: "Hidratação", className: "left-[6%] top-[18%]" },
  { label: "Textura", className: "right-[6%] top-[42%]" },
  { label: "Uniformidade", className: "bottom-[14%] left-[10%]" },
];

/**
 * Campaign picture of the skin analysis: the photo uploaded in the admin (Conteúdo → Análise de pele) or, while there
 * is none, the real photo of the banner's product on a soft light. Discreet interface marks (scan frame, scanning line,
 * analysis labels) are decoration only and carry no result.
 */
export function SkinVisual({ banner, sizes, priority = false, className }: { banner: Banner; sizes: string; priority?: boolean; className?: string }) {
  const photo = banner.image_desktop_url;
  const product = !photo ? banner.product?.image : null;
  return (
    <div className={cn("relative overflow-hidden", className)} style={{ backgroundColor: banner.background_color ?? "#F6E4E1" }}>
      {photo ? (
        <>
          <Image src={banner.image_mobile_url ?? photo} alt={banner.image_alt ?? ""} fill sizes={sizes} priority={priority} className="object-cover object-top sm:hidden" />
          <Image src={photo} alt={banner.image_alt ?? ""} fill sizes={sizes} priority={priority} className="hidden object-cover object-top sm:block" />
        </>
      ) : product ? (
        <>
          <div
            aria-hidden="true"
            className="absolute inset-[8%] rounded-[50%]"
            style={{ background: "radial-gradient(closest-side, rgba(255,255,255,0.95), rgba(255,255,255,0.55) 60%, rgba(255,255,255,0) 100%)" }}
          />
          <div className="absolute inset-[16%] mix-blend-multiply">
            <Image src={product.url} alt={banner.image_alt ?? banner.product?.name ?? ""} fill sizes={sizes} priority={priority} className="object-contain" />
          </div>
        </>
      ) : null}

      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        {/* scan frame */}
        <div className="absolute inset-[9%]">
          <span className="absolute left-0 top-0 h-7 w-7 border-l-[1.5px] border-t-[1.5px] border-white/90" />
          <span className="absolute right-0 top-0 h-7 w-7 border-r-[1.5px] border-t-[1.5px] border-white/90" />
          <span className="absolute bottom-0 left-0 h-7 w-7 border-b-[1.5px] border-l-[1.5px] border-white/90" />
          <span className="absolute bottom-0 right-0 h-7 w-7 border-b-[1.5px] border-r-[1.5px] border-white/90" />
        </div>
        <div className="absolute inset-x-[12%] top-1/2 h-px bg-gradient-to-r from-transparent via-white to-transparent opacity-80 motion-safe:animate-skin-scan" />
        {CHIPS.map((c) => (
          <span
            key={c.label}
            className={cn(
              "absolute hidden items-center gap-1.5 rounded-full border border-white/70 bg-white/75 px-2.5 py-1 text-[0.6875rem] font-medium text-ink shadow-[0_6px_18px_-10px_rgba(0,0,0,0.35)] backdrop-blur-sm sm:flex",
              c.className,
            )}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-rose-ink" /> {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}
