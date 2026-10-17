import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { ResetPassword } from "@/components/store/auth/password-recovery";
import { isSupabaseConfigured } from "@/lib/env";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Nova senha", robots: { index: false, follow: false } };

/** The recovery link opened a short session for the account; without it the page offers a new link. */
async function Content() {
  await connection();
  let hasSession = false;
  if (isSupabaseConfigured) {
    const { data } = await (await createServerSupabase()).auth.getUser();
    hasSession = Boolean(data.user);
  }
  return <ResetPassword hasSession={hasSession} />;
}

export default function ResetPasswordPage() {
  return (
    <div className="container-page py-12 sm:py-20">
      <Suspense fallback={<div className="mx-auto h-72 max-w-md animate-pulse bg-ivory" />}>
        <Content />
      </Suspense>
    </div>
  );
}
