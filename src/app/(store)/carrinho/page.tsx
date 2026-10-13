import type { Metadata } from "next";
import { CartPageContent } from "@/components/store/checkout/cart-page";
import { Breadcrumbs } from "@/components/store/breadcrumbs";

export const metadata: Metadata = {
  title: "Carrinho",
  robots: { index: false, follow: true },
};

export default function CartPage() {
  return (
    <div className="container-page py-10 sm:py-14">
      <Breadcrumbs items={[{ label: "Carrinho" }]} className="mb-8" />
      <h1 className="heading-display mb-10 text-[2.5rem] sm:text-[3.25rem]">Carrinho</h1>
      <CartPageContent />
    </div>
  );
}
