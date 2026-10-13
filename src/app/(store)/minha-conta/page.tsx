import type { Metadata } from "next";
import { AccountOverview } from "@/components/store/account-overview";
import { Breadcrumbs } from "@/components/store/breadcrumbs";

export const metadata: Metadata = {
  title: "Minha conta",
  robots: { index: false, follow: true },
};

export default function AccountPage() {
  return (
    <div className="container-page py-10 sm:py-14">
      <Breadcrumbs items={[{ label: "Minha conta" }]} className="mb-8" />
      <h1 className="heading-display text-[2rem] sm:text-[2.5rem]">Minha conta</h1>
      <p className="mb-10 mt-2 max-w-2xl text-[0.9375rem] leading-relaxed text-muted">Seus pedidos e favoritos salvos neste aparelho.</p>
      <AccountOverview />
    </div>
  );
}
