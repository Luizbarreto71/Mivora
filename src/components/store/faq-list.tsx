import { Plus } from "lucide-react";
import type { Faq } from "@/lib/types";

export function FaqList({ faqs }: { faqs: Faq[] }) {
  return (
    <div className="divide-y divide-line border-y border-line">
      {faqs.map((f) => (
        <details key={f.id} className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 text-left text-[0.9375rem] font-medium sm:text-base [&::-webkit-details-marker]:hidden">
            {f.question}
            <Plus className="h-4 w-4 shrink-0 transition-transform duration-300 group-open:rotate-45" strokeWidth={1.5} />
          </summary>
          <p className="max-w-3xl pb-6 pr-10 text-[0.9375rem] leading-relaxed text-muted">{f.answer}</p>
        </details>
      ))}
    </div>
  );
}
