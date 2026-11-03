"use client";

import { usePathname } from "next/navigation";
import { WhatsAppIcon } from "@/components/brand/social-icons";
import { cn } from "@/lib/utils";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { useStoreConfig } from "./store-config";

/** Floating contact button (only when the store has a number). Stays out of the way during the purchase steps. */
export function FloatingWhatsApp() {
  const pathname = usePathname();
  const { whatsappNumber, whatsappGreeting } = useStoreConfig();
  const hidden = !whatsappNumber || pathname === "/carrinho" || pathname === "/finalizar" || pathname.startsWith("/pedido/");
  if (hidden) return null;
  return (
    <a
      href={buildWhatsAppUrl(whatsappNumber, `${whatsappGreeting} Gostaria de atendimento.`)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Falar com a MIVORA no WhatsApp"
      className={cn(
        "fixed right-4 z-30 flex h-13 w-13 items-center justify-center rounded-full bg-[#1DA851] text-white shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] transition-transform hover:scale-105 sm:right-7 lg:bottom-7",
        // on product pages the phone has a sticky purchase bar at the bottom
        pathname.startsWith("/produtos/") ? "bottom-24" : "bottom-5 sm:bottom-7",
      )}
    >
      <WhatsAppIcon className="h-6 w-6" />
    </a>
  );
}
