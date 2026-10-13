import { cn } from "@/lib/utils";

/** Elegant temporary placeholder while the official product photo is pending. */
export function ProductImagePlaceholder({ name, brand, className }: { name: string; brand?: string; className?: string }) {
  return (
    <div className={cn("absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-ivory to-sand p-6 text-center", className)} role="img" aria-label={`Imagem de ${name} em breve`}>
      <div className="mb-5 h-20 w-11 rounded-t-[1.4rem] rounded-b-md border border-ink/15 bg-paper/60 sm:h-24 sm:w-12" aria-hidden="true">
        <div className="mx-auto mt-[-0.7rem] h-4 w-6 rounded-t-md border border-ink/15 bg-paper" />
      </div>
      {brand ? <p className="eyebrow text-[0.5625rem]">{brand}</p> : null}
      <p className="mt-1 line-clamp-2 max-w-[12rem] text-sm font-medium leading-snug text-ink/70">{name}</p>
      <p className="mt-3 text-[0.625rem] uppercase tracking-[0.18em] text-muted">Foto em breve</p>
    </div>
  );
}
