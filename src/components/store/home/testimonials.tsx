import { Star } from "lucide-react";
import type { Testimonial } from "@/lib/types";

/** Only real testimonials registered (with authorisation) in the admin. Stars only with a real rating. */
export function Testimonials({ items }: { items: Testimonial[] }) {
  return (
    <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:-mx-6 sm:px-6 md:mx-0 md:grid md:grid-cols-4 md:gap-4 md:overflow-visible md:px-0 md:pb-0 [&::-webkit-scrollbar]:hidden">
      {items.map((t) => (
        <li key={t.id} className="w-[78%] shrink-0 snap-start sm:w-[46%] md:w-auto">
          <figure className="flex h-full flex-col rounded-card bg-ivory p-6">
            {t.rating ? (
              <p className="flex gap-0.5" role="img" aria-label={`Avaliação: ${t.rating} de 5`}>
                {Array.from({ length: 5 }, (_, i) => (
                  <Star key={i} className={i < t.rating! ? "h-3.5 w-3.5 fill-ink text-ink" : "h-3.5 w-3.5 text-ink/25"} strokeWidth={1.5} aria-hidden="true" />
                ))}
              </p>
            ) : null}
            <blockquote className="mt-3 flex-1 text-[0.875rem] leading-relaxed text-ink-soft">“{t.body}”</blockquote>
            <figcaption className="mt-4 text-xs">
              <span className="font-semibold">{t.author_name}</span>
              {t.author_detail ? <span className="text-muted"> · {t.author_detail}</span> : null}
            </figcaption>
          </figure>
        </li>
      ))}
    </ul>
  );
}
