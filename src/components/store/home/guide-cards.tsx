import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export type Guide = { href: string; eyebrow: string; title: string; text: string; image: string; imageAlt: string };

/** "Aprenda com a MIVORA": ways to find the right products, each opening a real page of the store. */
export function GuideCards({ guides }: { guides: Guide[] }) {
  return (
    <ul className="grid gap-4 sm:gap-5 md:grid-cols-3">
      {guides.map((g) => (
        <li key={g.href}>
          <Link href={g.href} className="group flex h-full flex-col overflow-hidden rounded-card bg-ivory transition-shadow duration-300 hover:shadow-lift">
            <span className="relative block aspect-[16/10] overflow-hidden">
              <Image src={g.image} alt={g.imageAlt} fill sizes="(min-width: 768px) 30vw, 100vw" className="zoom-on-hover object-cover" />
            </span>
            <span className="flex flex-1 flex-col p-5 sm:p-6">
              <span className="t-label text-rose-ink">{g.eyebrow}</span>
              <span className="t-h3 mt-2 text-[1.1875rem]">{g.title}</span>
              <span className="mt-2 flex-1 text-[0.875rem] leading-relaxed text-muted">{g.text}</span>
              <span className="mt-5 inline-flex items-center gap-2 text-[0.8125rem] font-semibold">
                Saiba mais <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" strokeWidth={1.75} />
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
