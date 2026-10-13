import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { buttonClasses } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-ivory px-6 text-center">
      <Link href="/" aria-label="MIVORA" className="mb-14 h-20">
        <Logo variant="lockup" className="h-full" />
      </Link>
      <p className="eyebrow">Erro 404</p>
      <h1 className="heading-display mt-4 text-[2.75rem] sm:text-[3.5rem]">Página não encontrada</h1>
      <p className="mt-4 max-w-md text-[0.9375rem] leading-relaxed text-muted">
        O endereço pode ter mudado ou o produto não está mais disponível. Que tal explorar a nossa curadoria?
      </p>
      <div className="mt-10 flex flex-col gap-3 sm:flex-row">
        <Link href="/produtos" className={buttonClasses("primary", "lg")}>
          Ver produtos
        </Link>
        <Link href="/" className={buttonClasses("outline", "lg")}>
          Página inicial
        </Link>
      </div>
    </main>
  );
}
