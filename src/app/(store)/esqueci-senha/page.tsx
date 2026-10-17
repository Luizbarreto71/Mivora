import type { Metadata } from "next";
import { Suspense } from "react";
import { ForgotPassword } from "@/components/store/auth/password-recovery";

export const metadata: Metadata = { title: "Esqueceu sua senha?", robots: { index: false, follow: true } };

async function Content({ searchParams }: PageProps<"/esqueci-senha">) {
  const q = await searchParams;
  return <ForgotPassword invalidLink={q.link === "invalido"} />;
}

export default function ForgotPasswordPage(props: PageProps<"/esqueci-senha">) {
  return (
    <div className="container-page py-12 sm:py-20">
      <Suspense fallback={<div className="mx-auto h-72 max-w-md animate-pulse bg-ivory" />}>
        <Content {...props} />
      </Suspense>
    </div>
  );
}
