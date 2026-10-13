"use client";

import { usePathname } from "next/navigation";
import { WhatsAppIcon } from "@/components/brand/social-icons";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { useStoreConfig } from "./store-config";

/** Discreet contact shortcut. Hidden where a dedicated WhatsApp CTA already exists. */
export function FloatingWhatsApp() {
  const pathname = usePathname();
  const { whatsappNumber, whatsappGreeting } = useStoreConfig();
  const hidden = !whatsappNumber || pathname.startsWith("/produtos/") || pathname === "/carrinho" || pathname === "/finalizar";
  if (hidden) return null;
  return (
    <a
      href={buildWhatsAppUrl(whatsappNumber, `${whatsappGreeting} Gostaria de atendimento.`)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Falar com a MIVORA no WhatsApp"
      className="fixed bottom-5 right-4 z-30 flex h-13 w-13 items-center justify-center rounded-full bg-ink text-paper shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] transition-transform hover:scale-105 sm:bottom-7 sm:right-7"
    >
      <WhatsAppIcon className="h-6 w-6" />
    </a>
  );
}
