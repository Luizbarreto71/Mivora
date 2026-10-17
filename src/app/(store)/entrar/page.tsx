import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginScreen } from "@/components/store/auth/login-screen";
import { safeNext } from "@/lib/auth/password";

export const metadata: Metadata = { title: "Entrar", robots: { index: false, follow: true } };

async function Content({ searchParams }: PageProps<"/entrar">) {
  const q = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
  return <LoginScreen next={safeNext(one(q.next), "/minha-conta")} notice={one(q.link) === "outro-aparelho" ? "other-device" : one(q.login) === "erro" ? "error" : one(q.login) === "cancelado" ? "cancelled" : null} />;
}

export default function LoginPage(props: PageProps<"/entrar">) {
  return (
    <div className="container-page py-10 sm:py-16">
      <Suspense fallback={<div className="mx-auto h-96 max-w-4xl animate-pulse bg-ivory" />}>
        <Content {...props} />
      </Suspense>
    </div>
  );
}
