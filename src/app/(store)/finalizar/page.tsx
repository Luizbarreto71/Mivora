import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { CheckoutForm } from "@/components/store/checkout/checkout-form";
import { getDeliveryZones, getStoreSettings } from "@/lib/catalog/queries";

export const metadata: Metadata = {
  title: "Finalizar pedido",
  robots: { index: false, follow: false },
};

export default async function CheckoutPage() {
  const [zones, settings] = await Promise.all([getDeliveryZones(), getStoreSettings()]);
  return (
    <div className="container-page py-10 sm:py-14">
      <Breadcrumbs items={[{ label: "Carrinho", href: "/carrinho" }, { label: "Finalizar" }]} className="mb-8" />
      <h1 className="heading-display text-[2.5rem] sm:text-[3.25rem]">Finalizar pelo WhatsApp</h1>
      <p className="mt-3 max-w-2xl text-[0.9375rem] leading-relaxed text-muted">
        Revise o seu pedido. Ao continuar, registramos o pedido com um código e abrimos uma conversa com a MIVORA para confirmar disponibilidade, entrega e pagamento.
      </p>
      <div className="mt-10">
        <CheckoutForm
          zones={zones}
          pickupDetails={settings.pickup_enabled ? settings.pickup_details : null}
          minimumOrderCents={settings.minimum_order_cents}
          freeShippingThresholdCents={settings.free_shipping_enabled ? settings.free_shipping_threshold_cents : null}
        />
      </div>
    </div>
  );
}
