import { Headset, ShieldCheck, Truck, type LucideIcon } from "lucide-react";

const ICONS: LucideIcon[] = [ShieldCheck, Headset, Truck];

/** Strip below the banner: the store's own statements, edited in Admin → Configurações. */
export function Benefits({ items }: { items: { title: string; text: string }[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-label="Diferenciais da MIVORA" className="border-b border-line bg-paper">
      <ul className="container-page grid divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {items.map((b, i) => {
          const Icon = ICONS[i % ICONS.length];
          return (
            <li key={b.title} className="flex items-center gap-4 py-4 sm:justify-center sm:px-6 sm:py-6">
              <Icon className="h-6 w-6 shrink-0 text-ink/80" strokeWidth={1.25} aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-[0.8125rem] font-semibold">{b.title}</p>
                {b.text ? <p className="mt-0.5 text-xs text-muted">{b.text}</p> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
