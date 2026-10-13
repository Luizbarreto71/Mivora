import { cacheLife } from "next/cache";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { FacebookIcon, InstagramIcon, TikTokIcon, WhatsAppIcon } from "@/components/brand/social-icons";
import type { StoreSettings } from "@/lib/types";
import { buildWhatsAppUrl, normalizeWhatsAppNumber } from "@/lib/whatsapp";
import type { NavData } from "./header";
import { NewsletterForm } from "./newsletter-form";

async function CurrentYear() {
  "use cache";
  cacheLife("days");
  return <>{new Date().getFullYear()}</>;
}

type FooterLink = { href: string; label: string; external?: boolean };

/** Premium footer of the mockup: dark band (brand, social, newsletter) over white link columns. */
export function Footer({ settings, nav }: { settings: StoreSettings; nav: NavData }) {
  const whatsapp = normalizeWhatsAppNumber(settings.whatsapp_number);
  const whatsappHref = whatsapp ? buildWhatsAppUrl(whatsapp, `${settings.whatsapp_greeting} Gostaria de atendimento.`) : null;
  const socials = [
    settings.instagram_url && { href: settings.instagram_url, label: "Instagram", Icon: InstagramIcon },
    settings.tiktok_url && { href: settings.tiktok_url, label: "TikTok", Icon: TikTokIcon },
    whatsappHref && { href: whatsappHref, label: "WhatsApp", Icon: WhatsAppIcon },
    settings.facebook_url && { href: settings.facebook_url, label: "Facebook", Icon: FacebookIcon },
  ].filter(Boolean) as { href: string; label: string; Icon: typeof InstagramIcon }[];

  const columns: { title: string; links: FooterLink[] }[] = [
    {
      title: "Institucional",
      links: [
        { href: "/sobre", label: "Sobre nós" },
        { href: "/contato", label: "Contato" },
        { href: "/perguntas-frequentes", label: "FAQ" },
      ],
    },
    {
      title: "Categorias",
      links: [{ href: "/produtos", label: "Todos os produtos" }, ...nav.productTypes.slice(0, 5).map((t) => ({ href: `/categorias/${t.slug}`, label: t.name }))],
    },
    {
      title: "Marcas",
      links: [...nav.brands.slice(0, 5).map((b) => ({ href: `/marcas/${b.slug}`, label: b.name })), { href: "/marcas", label: "Ver todas" }],
    },
    {
      title: "Atendimento",
      links: [
        ...(whatsappHref ? [{ href: whatsappHref, label: "WhatsApp", external: true }] : []),
        { href: "/politica-de-envio", label: "Prazos e envios" },
        { href: "/politica-de-privacidade", label: "Política de privacidade" },
        { href: "/trocas-e-devolucoes", label: "Trocas e devoluções" },
        { href: "/termos-de-uso", label: "Termos de uso" },
      ],
    },
  ];

  return (
    <footer className="mt-20 sm:mt-24">
      <div className="bg-ink text-paper">
        <div className="container-page grid gap-10 py-12 lg:grid-cols-[1fr_1.1fr_1fr] lg:items-start lg:gap-12">
          <div>
            <Link href="/" aria-label="MIVORA — página inicial" className="inline-flex h-6">
              <Logo registered={settings.show_registered_mark} className="h-full text-paper" />
            </Link>
            {socials.length > 0 ? (
              <div className="mt-7">
                <p className="text-[0.8125rem] font-medium">Siga a gente</p>
                <div className="mt-3 flex gap-2">
                  {socials.map(({ href, label, Icon }) => (
                    <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={label} className="flex h-9 w-9 items-center justify-center rounded-full border border-paper/25 transition hover:border-paper">
                      <Icon className="h-4 w-4" />
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          {settings.newsletter_enabled ? <NewsletterForm /> : <div className="hidden lg:block" />}
          <div className="text-[0.8125rem] leading-relaxed text-paper/65 lg:text-right">
            <p className="font-medium text-paper">{settings.store_name}</p>
            <p className="mt-2 lg:ml-auto lg:max-w-xs">{settings.tagline ?? "Skincare coreano e beleza internacional, com curadoria e atendimento personalizado."}</p>
            {settings.contact_email ? (
              <a href={`mailto:${settings.contact_email}`} className="mt-2 inline-block hover:text-paper">
                {settings.contact_email}
              </a>
            ) : null}
            {settings.business_hours ? <p className="mt-1">{settings.business_hours}</p> : null}
          </div>
        </div>
      </div>

      <div className="border-b border-line bg-paper">
        <div className="container-page grid grid-cols-2 gap-x-6 gap-y-10 py-12 sm:grid-cols-4">
          {columns.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <p className="mb-4 text-[0.8125rem] font-semibold">{col.title}</p>
              <ul className="space-y-2.5 text-[0.8125rem]">
                {col.links.map((l) => (
                  <li key={l.href}>
                    {l.external ? (
                      <a href={l.href} target="_blank" rel="noopener noreferrer" className="text-muted transition-colors hover:text-ink">
                        {l.label}
                      </a>
                    ) : (
                      <Link href={l.href} className="text-muted transition-colors hover:text-ink">
                        {l.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>

      <div className="bg-paper">
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
