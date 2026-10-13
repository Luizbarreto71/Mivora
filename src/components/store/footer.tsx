import { cacheLife } from "next/cache";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { FacebookIcon, InstagramIcon, TikTokIcon, WhatsAppIcon } from "@/components/brand/social-icons";
import type { StoreSettings } from "@/lib/types";
import { buildWhatsAppUrl, normalizeWhatsAppNumber } from "@/lib/whatsapp";

async function CurrentYear() {
  "use cache";
  cacheLife("days");
  return <>{new Date().getFullYear()}</>;
}

const COLUMNS = [
  {
    title: "Loja",
    links: [
      { href: "/produtos", label: "Todos os produtos" },
      { href: "/marcas", label: "Marcas" },
      { href: "/categorias", label: "Categorias" },
      { href: "/novidades", label: "Novidades" },
      { href: "/mais-vendidos", label: "Mais vendidos" },
      { href: "/ritual", label: "Monte seu ritual" },
    ],
  },
  {
    title: "Atendimento",
    links: [
      { href: "/contato", label: "Contato" },
      { href: "/perguntas-frequentes", label: "Perguntas frequentes" },
      { href: "/politica-de-envio", label: "Política de envio" },
      { href: "/trocas-e-devolucoes", label: "Trocas e devoluções" },
    ],
  },
  {
    title: "MIVORA",
    links: [
      { href: "/sobre", label: "Sobre a MIVORA" },
      { href: "/politica-de-privacidade", label: "Política de privacidade" },
      { href: "/termos-de-uso", label: "Termos de uso" },
    ],
  },
];

export function Footer({ settings }: { settings: StoreSettings }) {
  const whatsapp = normalizeWhatsAppNumber(settings.whatsapp_number);
  const socials = [
    settings.instagram_url && { href: settings.instagram_url, label: "Instagram", Icon: InstagramIcon },
    settings.tiktok_url && { href: settings.tiktok_url, label: "TikTok", Icon: TikTokIcon },
    settings.facebook_url && { href: settings.facebook_url, label: "Facebook", Icon: FacebookIcon },
  ].filter(Boolean) as { href: string; label: string; Icon: typeof InstagramIcon }[];

  return (
    <footer className="mt-24 border-t border-line bg-ivory">
      <div className="container-page grid gap-12 py-16 lg:grid-cols-[1.3fr_2fr] lg:gap-20">
        <div className="max-w-sm">
          <Link href="/" aria-label="MIVORA" className="inline-flex h-16">
            <Logo variant="lockup" registered={settings.show_registered_mark} className="h-full" />
          </Link>
          <p className="mt-6 text-sm leading-relaxed text-muted">
            {settings.tagline ?? "Boutique digital de skincare e beleza internacional, com curadoria e atendimento personalizado."}
          </p>
          <div className="mt-6 space-y-2 text-sm">
            {whatsapp ? (
              <a href={buildWhatsAppUrl(whatsapp, `${settings.whatsapp_greeting} Gostaria de atendimento.`)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:underline">
                <WhatsAppIcon className="h-4 w-4" /> WhatsApp
              </a>
            ) : null}
            {settings.contact_email ? (
              <a href={`mailto:${settings.contact_email}`} className="block hover:underline">
                {settings.contact_email}
              </a>
            ) : null}
            {settings.business_hours ? <p className="text-muted">{settings.business_hours}</p> : null}
          </div>
          {socials.length > 0 ? (
            <div className="mt-6 flex gap-2">
              {socials.map(({ href, label, Icon }) => (
                <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={label} className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-paper hover:border-ink">
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="eyebrow mb-5 text-ink">{col.title}</p>
              <ul className="space-y-3 text-sm">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-ink-soft hover:text-ink hover:underline hover:underline-offset-4">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-line">
        <div className="container-page flex flex-col gap-2 py-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>
            © <CurrentYear /> {settings.legal_name ?? settings.store_name}
            {settings.cnpj ? ` · CNPJ ${settings.cnpj}` : ""}
            {settings.address ? ` · ${settings.address}` : ""}
          </p>
          <p>As marcas exibidas pertencem aos seus respectivos titulares.</p>
        </div>
      </div>
    </footer>
  );
}
