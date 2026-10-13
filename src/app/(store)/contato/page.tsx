import { Clock, Mail, MapPin, Phone } from "lucide-react";
import { InstagramIcon, WhatsAppIcon } from "@/components/brand/social-icons";
import { InstitutionalPage, institutionalMetadata } from "@/components/store/institutional-page";
import { buttonClasses } from "@/components/ui/button";
import { getStoreSettings } from "@/lib/catalog/queries";
import { buildWhatsAppUrl, normalizeWhatsAppNumber } from "@/lib/whatsapp";

export function generateMetadata() {
  return institutionalMetadata("contato", "Contato");
}

export default async function ContactPage() {
  const s = await getStoreSettings();
  const whatsapp = normalizeWhatsAppNumber(s.whatsapp_number);
  const rows = [
    s.contact_phone && { Icon: Phone, label: "Telefone", value: s.contact_phone, href: `tel:${s.contact_phone.replace(/[^\d+]/g, "")}` },
    s.contact_email && { Icon: Mail, label: "E-mail", value: s.contact_email, href: `mailto:${s.contact_email}` },
    s.business_hours && { Icon: Clock, label: "Horário de atendimento", value: s.business_hours },
    s.address && { Icon: MapPin, label: "Endereço", value: s.address },
    s.instagram_url && { Icon: InstagramIcon, label: "Instagram", value: s.instagram_url.replace(/^https?:\/\/(www\.)?/, ""), href: s.instagram_url },
  ].filter(Boolean) as { Icon: typeof Phone; label: string; value: string; href?: string }[];

  return (
    <InstitutionalPage slug="contato">
      <div className="mt-10 space-y-8">
        {whatsapp ? (
          <a href={buildWhatsAppUrl(whatsapp, `${s.whatsapp_greeting} Gostaria de atendimento.`)} target="_blank" rel="noopener noreferrer" className={buttonClasses("primary", "lg")}>
            <WhatsAppIcon className="h-4 w-4" /> Conversar pelo WhatsApp
          </a>
        ) : null}
        {rows.length > 0 ? (
          <ul className="divide-y divide-line border-y border-line">
            {rows.map(({ Icon, label, value, href }) => (
              <li key={label} className="flex gap-4 py-5">
                <Icon className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} />
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-muted">{label}</p>
                  {href ? (
                    <a href={href} className="mt-1 block text-[0.9375rem] hover:underline" target={href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer">
                      {value}
                    </a>
                  ) : (
                    <p className="mt-1 text-[0.9375rem]">{value}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        {s.legal_name || s.cnpj ? (
          <div className="text-sm text-muted">
            {s.legal_name ? <p>{s.legal_name}</p> : null}
            {s.cnpj ? <p>CNPJ {s.cnpj}</p> : null}
          </div>
        ) : null}
        {!whatsapp && rows.length === 0 ? <p className="text-sm text-muted">Os canais de atendimento serão divulgados em breve.</p> : null}
      </div>
    </InstitutionalPage>
  );
}
