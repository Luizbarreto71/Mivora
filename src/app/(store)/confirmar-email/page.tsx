import type { Metadata } from "next";
import { Suspense } from "react";
import { ConfirmEmail } from "@/components/store/auth/confirm-email";
import { safeNext } from "@/lib/auth/password";

export const metadata: Metadata = { title: "Confirme seu e-mail", robots: { index: false, follow: false } };

async function Content({ searchParams }: PageProps<"/confirmar-email">) {
  const q = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  return <ConfirmEmail email={one(q.email).slice(0, 254)} next={safeNext(one(q.next), "/minha-conta")} justSent={one(q.enviado) === "1"} invalidLink={one(q.link) === "invalido"} />;
}

export default function ConfirmEmailPage(props: PageProps<"/confirmar-email">) {
  return (
    <div className="container-page py-12 sm:py-20">
      <Suspense fallback={<div className="mx-auto h-80 max-w-lg animate-pulse bg-ivory" />}>
        <Content {...props} />
      </Suspense>
    </div>
  );
}
