import Link from "next/link";
import { Suspense } from "react";
import { CartDrawer } from "@/components/store/cart-drawer";
import { CartProvider } from "@/components/store/cart-context";
import { FloatingWhatsApp } from "@/components/store/floating-whatsapp";
import { Footer } from "@/components/store/footer";
import { Header, type NavData } from "@/components/store/header";
import { StoreConfigProvider } from "@/components/store/store-config";
import { WelcomeIntro } from "@/components/store/welcome-intro";
import { getBrands, getCategories, getKits, getStoreSettings } from "@/lib/catalog/queries";
import { SITE_URL } from "@/lib/env";
import { normalizeWhatsAppNumber } from "@/lib/whatsapp";

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const [settings, categories, brands, kits] = await Promise.all([getStoreSettings(), getCategories(), getBrands(), getKits()]);

  const nav: NavData = {
    productTypes: categories.filter((c) => c.kind === "product_type" && !c.parent_id && c.productCount > 0).map(({ slug, name }) => ({ slug, name })),
    concerns: categories.filter((c) => c.kind === "concern" && c.productCount > 0).map(({ slug, name }) => ({ slug, name })),
    brands: brands.filter((b) => b.productCount > 0).map(({ slug, name }) => ({ slug, name })),
    hasKits: kits.length > 0,
  };

  return (
    <StoreConfigProvider
      value={{
        whatsappNumber: normalizeWhatsAppNumber(settings.whatsapp_number),
        whatsappGreeting: settings.whatsapp_greeting,
        deliverySummary: settings.delivery_summary,
        businessHours: settings.business_hours,
        siteUrl: SITE_URL,
        comingSoonInquiry: settings.coming_soon_inquiry_enabled,
        welcomeOffer: settings.welcome_offer_enabled ? { code: settings.welcome_offer_code, percent: settings.welcome_offer_percent } : null,
        shippingCalculator: settings.shipping_calculator_enabled,
      }}
    >
      <CartProvider>
        <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:bg-ink focus:px-4 focus:py-2 focus:text-paper">
          Pular para o conteúdo
        </a>
        {!(settings.announcement_enabled && settings.announcement_text) && settings.welcome_offer_enabled ? (
          <div className="bg-ink text-paper">
            <p className="container-page flex min-h-9 items-center justify-center py-2 text-center text-[0.6875rem] font-medium uppercase tracking-[0.18em]">
              Novas clientes ganham {settings.welcome_offer_percent}% OFF na primeira compra · cupom {settings.welcome_offer_code}
            </p>
          </div>
        ) : null}
        {settings.announcement_enabled && settings.announcement_text ? (
          <div className="bg-ink text-paper">
            <div className="container-page flex min-h-9 items-center justify-center py-2 text-center text-[0.6875rem] font-medium uppercase tracking-[0.18em]">
              {settings.announcement_href ? (
                <Link href={settings.announcement_href} className="hover:underline">
                  {settings.announcement_text}
                </Link>
              ) : (
                settings.announcement_text
              )}
            </div>
          </div>
        ) : null}
        <Header nav={nav} registered={settings.show_registered_mark} />
        <main id="conteudo">{children}</main>
        <Footer settings={settings} />
        <CartDrawer />
        <WelcomeIntro />
        <Suspense fallback={null}>
          <FloatingWhatsApp />
        </Suspense>
      </CartProvider>
    </StoreConfigProvider>
  );
}
