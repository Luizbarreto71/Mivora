import type { Metadata } from "next";
import { Suspense } from "react";
import { SignUpForm } from "@/components/store/auth/signup-form";
import { safeNext } from "@/lib/auth/password";

export const metadata: Metadata = { title: "Criar conta", robots: { index: false, follow: true } };

async function Content({ searchParams }: PageProps<"/criar-conta">) {
  const q = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  return <SignUpForm next={safeNext(one(q.next), "/minha-conta")} initialEmail={one(q.email).slice(0, 254)} />;
}

export default function SignUpPage(props: PageProps<"/criar-conta">) {
  return (
    <div className="container-page py-10 sm:py-16">
      <div className="mx-auto max-w-3xl">
        <h1 className="heading-display text-[1.875rem] uppercase tracking-[0.04em] sm:text-[2.375rem]">Crie sua conta MIVORA</h1>
        <p className="mt-3 max-w-2xl text-[0.9375rem] leading-relaxed text-ink-soft">
          Crie sua conta para acompanhar seus pedidos, salvar seus dados e ter uma experiência de compra mais prática.
        </p>
        <div className="mt-8 border border-line bg-paper p-5 sm:p-8">
          <Suspense fallback={<div className="h-96 animate-pulse bg-ivory" />}>
            <Content {...props} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
