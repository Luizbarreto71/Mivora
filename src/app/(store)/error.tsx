"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button, buttonClasses } from "@/components/ui/button";

export default function StoreError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="container-page flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
      <p className="eyebrow">Algo deu errado</p>
      <h1 className="heading-display mt-4 text-[2rem]">Não foi possível carregar esta página</h1>
      <p className="mt-4 max-w-md text-sm text-muted">Tente novamente em instantes. Se o problema continuar, fale com a gente pelo WhatsApp.</p>
      <div className="mt-8 flex gap-3">
        <Button onClick={() => retry()}>Tentar novamente</Button>
        <Link href="/" className={buttonClasses("outline")}>
          Página inicial
        </Link>
      </div>
    </div>
  );
}
