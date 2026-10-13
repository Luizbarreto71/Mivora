import type { MetadataRoute } from "next";
import { getSitemapData } from "@/lib/catalog/queries";
import { SITE_URL } from "@/lib/env";

const STATIC_ROUTES = [
  "",
  "/produtos",
  "/marcas",
  "/categorias",
  "/novidades",
  "/mais-vendidos",
  "/ofertas",
  "/kits",
  "/ritual",
  "/sobre",
  "/contato",
  "/perguntas-frequentes",
  "/politica-de-privacidade",
  "/termos-de-uso",
  "/politica-de-envio",
  "/trocas-e-devolucoes",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const data = await getSitemapData();
  return [
    ...STATIC_ROUTES.map((path) => ({ url: `${SITE_URL}${path}`, changeFrequency: "weekly" as const, priority: path === "" ? 1 : 0.6 })),
    ...data.products.map((p) => ({ url: `${SITE_URL}/produtos/${p.slug}`, lastModified: p.updated_at, changeFrequency: "weekly" as const, priority: 0.9 })),
    ...data.brands.map((b) => ({ url: `${SITE_URL}/marcas/${b.slug}`, lastModified: b.updated_at, priority: 0.7 })),
    ...data.categories.map((c) => ({ url: `${SITE_URL}/categorias/${c.slug}`, lastModified: c.updated_at, priority: 0.7 })),
    ...data.kits.map((k) => ({ url: `${SITE_URL}/kits/${k.slug}`, lastModified: k.updated_at, priority: 0.6 })),
  ];
}
