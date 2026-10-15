import type { Metadata } from "next";
import { CheckoutFlow } from "@/components/store/checkout/checkout-flow";
import { getDeliveryZones, getStoreSettings } from "@/lib/catalog/queries";

export const metadata: Metadata = {
  title: "Finalizar compra",
  robots: { index: false, follow: false },
};

export default async function CheckoutPage() {
  const [zones, settings] = await Promise.all([getDeliveryZones(), getStoreSettings()]);
  return (
    <div className="container-page max-w-6xl py-8 sm:py-12">
      <h1 className="heading-display mb-6 text-[1.75rem] sm:text-[2.25rem]">Finalizar compra</h1>
      <CheckoutFlow
        zones={zones}
        calculatorEnabled={settings.shipping_calculator_enabled}
        pickupDetails={settings.pickup_enabled ? settings.pickup_details : null}
        minimumOrderCents={settings.minimum_order_cents}
      />
    </div>
  );
}
