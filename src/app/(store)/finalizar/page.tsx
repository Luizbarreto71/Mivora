import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { CheckoutForm } from "@/components/store/checkout/checkout-form";
import { getDeliveryZones, getStoreSettings } from "@/lib/catalog/queries";
import { mercadoPagoConfig } from "@/lib/payments/mercadopago";

export const metadata: Metadata = {
  title: "Finalizar pedido",
  robots: { index: false, follow: false },
};

export default async function CheckoutPage() {
  const [zones, settings] = await Promise.all([getDeliveryZones(), getStoreSettings()]);
  const online = settings.online_payment_enabled && mercadoPagoConfig().ready;
  return (
    <div className="container-page py-10 sm:py-14">
      <Breadcrumbs items={[{ label: "Carrinho", href: "/carrinho" }, { label: "Finalizar" }]} className="mb-8" />
      <h1 className="heading-display text-[2rem] sm:text-[2.5rem]">{online ? "Finalizar compra" : "Finalizar pelo WhatsApp"}</h1>
      <p className="mt-3 max-w-2xl text-[0.9375rem] leading-relaxed text-muted">
        {online
          ? "Faça seu cadastro rápido, escolha a entrega e pague pelo site com Pix, cartão ou boleto, pelo Mercado Pago. Se preferir, finalize pelo WhatsApp com a nossa equipe."
          : "Faça seu cadastro rápido, escolha a entrega e revise o pedido. Ao continuar, registramos o pedido com um código e abrimos uma conversa com a MIVORA para confirmar disponibilidade, entrega e pagamento."}
      </p>
      <div className="mt-10">
        <CheckoutForm
          zones={zones}
          calculatorEnabled={settings.shipping_calculator_enabled}
          pickupDetails={settings.pickup_enabled ? settings.pickup_details : null}
          minimumOrderCents={settings.minimum_order_cents}
          freeShippingThresholdCents={settings.free_shipping_enabled ? settings.free_shipping_threshold_cents : null}
        />
      </div>
    </div>
  );
}
