import { AdminSidebar } from "@/components/admin/sidebar";
import { requireAdmin } from "@/lib/admin/auth";
import { signOut } from "@/lib/admin/actions/auth";
import { isSupabaseConfigured } from "@/lib/env";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured) {
    return (
      <main className="mx-auto max-w-xl px-6 py-24 text-center">
        <h1 className="text-xl font-semibold">Supabase não configurado</h1>
        <p className="mt-3 text-sm text-muted">Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY e reinicie a aplicação. Consulte o README.</p>
      </main>
    );
  }
  const session = await requireAdmin();
  return (
    <div className="min-h-dvh bg-[#f6f6f4] lg:flex">
      <AdminSidebar email={session.user.email} signOut={signOut} />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
